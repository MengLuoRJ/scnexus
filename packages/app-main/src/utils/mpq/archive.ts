import { access, readFile as readDiskFile, rename, rm } from "node:fs/promises";
import { basename } from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { MpqFileNotFoundError, MpqReadOnlyError } from "./errors";
import { normalizeMpqPath } from "./crypto";
import { MpqReader } from "./reader";
import { openMpqSource, type MpqSource } from "./source";
import { rebuildMpq, type MpqWriteFile } from "./writer";
import {
  MPQ_FILE_FLAGS,
  type MpqAddOptions,
  type MpqArchiveApi,
  type MpqArchiveInfo,
  type MpqCreateOptions,
  type MpqExtractOptions,
  type MpqFileEntry,
  type MpqInput,
  type MpqOpenOptions,
  type MpqReadOptions,
  type MpqTreeNode,
} from "./types";

type StagedFile = {
  path: string;
  data: Buffer;
  options: MpqAddOptions;
};

type StagedRename = {
  oldPath: string;
  newPath: string;
};

export class MpqArchive implements MpqArchiveApi {
  private source: MpqSource;
  private reader: MpqReader;
  private entries: MpqFileEntry[];
  private readonly openOptions: MpqOpenOptions;
  private sourcePath?: string;
  private readonly added = new Map<string, StagedFile>();
  private readonly deleted = new Set<string>();
  private readonly renamed = new Map<string, StagedRename>();
  private closed = false;

  private constructor(
    source: MpqSource,
    reader: MpqReader,
    sourcePath: string | undefined,
    options: MpqOpenOptions,
    entries: MpqFileEntry[],
  ) {
    this.source = source;
    this.reader = reader;
    this.sourcePath = sourcePath;
    this.openOptions = options;
    this.entries = entries;
  }

  static async open(
    input: MpqInput,
    options: MpqOpenOptions = {},
  ): Promise<MpqArchive> {
    const source = await openMpqSource(input, options);
    try {
      const reader = await MpqReader.open(source, options);
      return new MpqArchive(
        source,
        reader,
        typeof input === "string" ? input : undefined,
        options,
        await reader.list(),
      );
    } catch (error) {
      await source.close();
      throw error;
    }
  }

  get info(): MpqArchiveInfo {
    return { ...this.reader.info, fileCount: this.fileCount };
  }

  get fileCount(): number {
    this.assertOpen();
    return this.entries.filter((entry) => entry.isFile &&
      (!entry.name || (!this.deleted.has(keyOf(entry.name)) &&
        !this.added.has(keyOf(entry.name))))).length + this.added.size;
  }

  async list(): Promise<MpqFileEntry[]> {
    this.assertOpen();
    const result: MpqFileEntry[] = [];
    for (const entry of await this.reader.list()) {
      if (!entry.name) {
        result.push(entry);
        continue;
      }
      const key = keyOf(entry.name);
      if (this.deleted.has(key) || this.added.has(key)) continue;
      result.push({
        ...entry,
        name: this.renamed.get(key)?.newPath ?? entry.name,
      });
    }
    let blockIndex = this.reader.info.blockTableSize;
    for (const staged of this.added.values()) {
      result.push(stagedEntry(staged, blockIndex));
      blockIndex += 1;
    }
    return result;
  }

  async listTree(): Promise<MpqTreeNode> {
    const root: MpqTreeNode = {
      name: this.sourcePath ? basename(this.sourcePath) : "archive.mpq",
      path: "",
      type: "directory",
      children: [],
    };
    const directories = new Map<string, MpqTreeNode>([["", root]]);
    for (const entry of await this.list()) {
      if (!entry.name) continue;
      appendTreeEntry(root, directories, entry);
    }
    sortTree(root);
    return root;
  }

  async hasFile(path: string): Promise<boolean> {
    this.assertOpen();
    const key = keyOf(path);
    if (this.added.has(key)) return true;
    if (this.deleted.has(key)) return false;
    if ([...this.renamed.values()].some((value) => keyOf(value.newPath) === key)) {
      return true;
    }
    if (this.renamed.has(key)) return false;
    return this.reader.hasFile(path);
  }

  async readFile(path: string, options: MpqReadOptions = {}): Promise<Buffer> {
    this.assertOpen();
    const key = keyOf(path);
    const staged = this.added.get(key);
    if (staged) return enforceReadLimit(staged.data, path, options);
    if (this.deleted.has(key) || this.renamed.has(key)) {
      throw new MpqFileNotFoundError(path);
    }
    const originalPath = this.originalPathFor(path);
    return this.reader.readFile(originalPath, options);
  }

  async readTextFile(
    path: string,
    encoding: BufferEncoding = "utf8",
    options: MpqReadOptions = {},
  ): Promise<string> {
    return (await this.readFile(path, options)).toString(encoding);
  }

  async extract(
    path: string,
    destination: string,
    options: MpqExtractOptions = {},
  ): Promise<void> {
    const data = await this.readFile(path);
    if (!options.overwrite && (await pathExists(destination))) {
      throw new Error(`Destination already exists: ${destination}`);
    }
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }

  async add(
    source: string | Buffer | Readable,
    options: MpqAddOptions,
  ): Promise<void> {
    this.assertWritable();
    const path = normalizeMpqPath(options.archivePath ?? sourceName(source));
    const key = keyOf(path);
    if (!options.replace && (await this.hasFile(path))) {
      throw new Error(`MPQ file already exists: ${path}`);
    }
    const data = await materialize(source);
    const previousRename = this.renamed.get(key);
    if (previousRename) {
      const entry = this.entries.find((value) => value.name && keyOf(value.name) === key)!;
      const previousData = await this.reader.readFile(previousRename.oldPath);
      this.added.set(keyOf(previousRename.newPath), {
        path: previousRename.newPath,
        data: previousData,
        options: {
          compress: entry.isCompressed,
          encrypt: entry.isEncrypted,
          locale: entry.locale,
          platform: entry.platform,
        },
      });
      this.renamed.delete(key);
    }
    const originalKey = keyOf(this.originalPathFor(path));
    if (originalKey !== key) {
      this.deleted.add(originalKey);
      this.renamed.delete(originalKey);
    }
    this.added.set(key, { path, data, options });
    this.deleted.delete(key);
  }

  async delete(path: string): Promise<void> {
    this.assertWritable();
    if (!(await this.hasFile(path))) throw new MpqFileNotFoundError(path);
    const originalKey = keyOf(this.originalPathFor(path));
    this.added.delete(keyOf(path));
    if (this.entries.some((entry) => entry.name && keyOf(entry.name) === originalKey)) {
      this.deleted.add(originalKey);
    }
    this.removeRename(path);
  }

  async rename(path: string, newPath: string): Promise<void> {
    this.assertWritable();
    if (!(await this.hasFile(path))) throw new MpqFileNotFoundError(path);
    if (await this.hasFile(newPath)) throw new Error(`MPQ file already exists: ${newPath}`);
    const oldKey = keyOf(path);
    const normalizedNewPath = normalizeMpqPath(newPath);
    const staged = this.added.get(oldKey);
    if (staged) {
      this.added.delete(oldKey);
      if (this.entries.some((entry) => entry.name && keyOf(entry.name) === oldKey)) {
        this.deleted.add(oldKey);
      }
      this.added.set(keyOf(normalizedNewPath), {
        ...staged,
        path: normalizedNewPath,
      });
      return;
    }
    const originalPath = this.originalPathFor(path);
    this.renamed.set(keyOf(originalPath), {
      oldPath: normalizeMpqPath(originalPath),
      newPath: normalizedNewPath,
    });
  }

  async save(destination = this.sourcePath): Promise<void> {
    this.assertWritable();
    if (!destination) {
      throw new Error("A destination path is required for stream-backed MPQ archives");
    }
    const existing = await this.reader.list();
    const unknown = existing.find((entry) => !entry.name && entry.isFile);
    if (unknown) {
      throw new Error(
        `Cannot safely rebuild MPQ with unnamed block index ${unknown.blockIndex}; provide a complete listfile`,
      );
    }
    const finalNames = this.finalNames(existing);
    const userData = await this.reader.readUserData();
    const samePath = this.sourcePath !== undefined && destination === this.sourcePath;
    const rebuildPath = samePath
      ? `${destination}.${randomUUID()}.rebuild`
      : destination;

    await rebuildMpq(rebuildPath, finalNames, this.writeFiles(existing), {
      sectorSizeShift: this.reader.header.sectorSizeShift,
      userData,
    });
    await this.reader.close();
    if (samePath) await replaceSavedArchive(rebuildPath, destination);
    await this.reopen(destination);
    this.added.clear();
    this.deleted.clear();
    this.renamed.clear();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.reader.close();
  }

  private async *writeFiles(
    existing: MpqFileEntry[],
  ): AsyncGenerator<MpqWriteFile> {
    for (const entry of existing) {
      if (!entry.name || isRegeneratedInternalFile(entry.name)) continue;
      const key = keyOf(entry.name);
      if (this.deleted.has(key) || this.added.has(key)) continue;
      yield {
        path: this.renamed.get(key)?.newPath ?? entry.name,
        data: await this.reader.readFile(entry.name),
        locale: entry.locale,
        platform: entry.platform,
        compress: entry.isCompressed,
        encrypt: entry.isEncrypted,
      };
    }
    for (const staged of this.added.values()) {
      yield {
        path: staged.path,
        data: staged.data,
        locale: staged.options.locale,
        platform: staged.options.platform,
        compress: staged.options.compress,
        encrypt: staged.options.encrypt,
      };
    }
  }

  private finalNames(existing: MpqFileEntry[]): string[] {
    const names: string[] = [];
    for (const entry of existing) {
      if (!entry.name || isRegeneratedInternalFile(entry.name)) continue;
      const key = keyOf(entry.name);
      if (!this.deleted.has(key) && !this.added.has(key)) {
        names.push(this.renamed.get(key)?.newPath ?? entry.name);
      }
    }
    for (const staged of this.added.values()) names.push(staged.path);
    return names;
  }

  private originalPathFor(path: string): string {
    const key = keyOf(path);
    for (const rename of this.renamed.values()) {
      if (keyOf(rename.newPath) === key) return rename.oldPath;
    }
    return path;
  }

  private removeRename(path: string) {
    const key = keyOf(path);
    this.renamed.delete(key);
    for (const [oldKey, rename] of this.renamed) {
      if (keyOf(rename.newPath) === key) this.renamed.delete(oldKey);
    }
  }

  private async reopen(path: string) {
    this.source = await openMpqSource(path, this.openOptions);
    this.reader = await MpqReader.open(this.source, this.openOptions);
    this.entries = await this.reader.list();
    this.sourcePath = path;
    this.closed = false;
  }

  private assertOpen() {
    if (this.closed) throw new Error("MPQ archive is closed");
  }

  private assertWritable() {
    this.assertOpen();
    if (!this.openOptions.writable) throw new MpqReadOnlyError();
  }
}

export async function createMpq(
  destination: string,
  options: MpqCreateOptions = {},
): Promise<MpqArchive> {
  await rebuildMpq(destination, [], emptyFiles(), options);
  return MpqArchive.open(destination, { writable: true });
}

async function* emptyFiles(): AsyncGenerator<MpqWriteFile> {}

function keyOf(path: string): string {
  return normalizeMpqPath(path).toUpperCase();
}

function sourceName(source: string | Buffer | Readable): string {
  if (typeof source === "string") return basename(source);
  throw new Error("archivePath is required when adding a Buffer or stream");
}

async function materialize(source: string | Buffer | Readable): Promise<Buffer> {
  if (typeof source === "string") return readDiskFile(source);
  if (Buffer.isBuffer(source)) return Buffer.from(source);
  const chunks: Buffer[] = [];
  for await (const chunk of source) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function stagedEntry(staged: StagedFile, blockIndex: number): MpqFileEntry {
  return {
    name: staged.path,
    hashIndex: -1,
    blockIndex,
    locale: staged.options.locale ?? 0,
    platform: staged.options.platform ?? 0,
    offset: 0n,
    compressedSize: staged.data.length,
    size: staged.data.length,
    flags: MPQ_FILE_FLAGS.EXISTS | MPQ_FILE_FLAGS.SINGLE_UNIT,
    isFile: true,
    isCompressed: staged.options.compress !== false,
    isEncrypted: staged.options.encrypt === true,
    isSingleUnit: true,
  };
}

function appendTreeEntry(
  root: MpqTreeNode,
  directories: Map<string, MpqTreeNode>,
  entry: MpqFileEntry,
) {
  const path = entry.name!.replaceAll("\\", "/");
  const parts = path.split("/").filter(Boolean);
  let parent = root;
  let parentPath = "";
  for (let index = 0; index < parts.length - 1; index += 1) {
    parentPath = parentPath ? `${parentPath}/${parts[index]}` : parts[index];
    let node = directories.get(parentPath);
    if (!node) {
      node = {
        name: parts[index],
        path: parentPath,
        type: "directory",
        children: [],
      };
      parent.children?.push(node);
      directories.set(parentPath, node);
    }
    parent = node;
  }
  parent.children?.push({
    name: parts.at(-1)!,
    path,
    type: "file",
    entry,
  });
}

function sortTree(node: MpqTreeNode) {
  node.children?.sort(
    (left, right) =>
      Number(right.type === "directory") - Number(left.type === "directory") ||
      left.name.localeCompare(right.name),
  );
  node.children?.forEach(sortTree);
}

function isRegeneratedInternalFile(path: string) {
  const key = keyOf(path);
  return key === "(LISTFILE)" || key === "(ATTRIBUTES)" || key === "(SIGNATURE)";
}

function enforceReadLimit(
  data: Buffer,
  path: string,
  options: MpqReadOptions,
) {
  if (options.maxBytes !== undefined && data.length > options.maxBytes) {
    throw new RangeError(
      `MPQ file exceeds the ${options.maxBytes} byte read limit: ${path}`,
    );
  }
  return Buffer.from(data);
}

async function pathExists(path: string) {
  return access(path).then(
    () => true,
    () => false,
  );
}

async function replaceSavedArchive(rebuildPath: string, destination: string) {
  const backupPath = `${destination}.${randomUUID()}.bak`;
  await rename(destination, backupPath);
  try {
    await rename(rebuildPath, destination);
    await rm(backupPath, { force: true });
  } catch (error) {
    await rename(backupPath, destination);
    throw error;
  }
}