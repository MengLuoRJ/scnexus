import { constants, createWriteStream } from "node:fs";
import { copyFile, link, mkdir, mkdtemp, open, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";

export const Compression = {
  NONE: 0, HUFFMAN: 0x01, ZLIB: 0x02, PKWARE: 0x08,
  BZIP2: 0x10, LZMA: 0x12, SPARSE: 0x20, ADPCM_MONO: 0x40, ADPCM_STEREO: 0x80,
} as const;

export interface OpenOptions {
  writable?: boolean;
  listfile?: string;
  tempDirectory?: string;
}
export interface CreateOptions { maxFileCount?: number }
export interface AddOptions {
  archivePath?: string;
  replace?: boolean;
  encrypt?: boolean;
  compression?: number;
}
export interface FileEntry {
  name: string;
  size: number;
  compressedSize: number;
  flags: number;
  locale: number;
  blockIndex: number;
  hashIndex: number;
}
export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  entry?: FileEntry;
  children?: TreeNode[];
}

export class StormLibError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "StormLibError";
  }
}

type Reply = {
  id: number;
  value?: unknown;
  error?: { message: string; name: string; code?: number };
};
type Pending = { resolve(value: unknown): void; reject(error: Error): void };

export class Archive {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private readonly ready: Promise<unknown>;
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private closing = false;
  private closePromise?: Promise<void>;
  private failure?: Error;

  private constructor(
    readonly path: string,
    private readonly writable: boolean,
    mode: "read" | "write" | "create",
    capacity: number,
    private readonly temporaryDirectory?: string,
  ) {
    this.ready = new Promise((resolveReady, reject) => {
      this.pending.set(0, { resolve: resolveReady, reject });
    });
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      execArgv: [], workerData: { path, mode, capacity },
    });
    this.worker.on("message", (reply: Reply) => {
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      if (reply.error) {
        const error = reply.error.code !== undefined
          ? new StormLibError(reply.error.message, reply.error.code)
          : Object.assign(new Error(reply.error.message), { name: reply.error.name });
        pending.reject(error);
      } else pending.resolve(reply.value);
      if (!this.pending.size) this.worker.unref();
    });
    this.worker.on("error", error => this.fail(error));
    this.worker.on("exit", code => {
      this.fail(new Error(`StormLib worker exited with code ${code}`));
    });
  }

  static async open(input: string | Readable, options: OpenOptions = {}): Promise<Archive> {
    let directory: string | undefined;
    let path: string;
    try {
      if (typeof input === "string") path = resolve(diskPath(input));
      else {
        directory = await mkdtemp(join(options.tempDirectory ?? tmpdir(), "node-stormlib-"));
        path = join(directory, "archive.mpq");
        await pipeline(input, createWriteStream(path, { flags: "wx" }));
      }
      const archive = new Archive(path, options.writable === true,
        options.writable ? "write" : "read", 0, directory);
      try {
        await archive.ready;
        if (options.listfile) await archive.enqueue(() => archive.request("listfile", [resolve(diskPath(options.listfile!))]));
        return archive;
      } catch (error) {
        await archive.worker.terminate();
        throw error;
      }
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  static async create(path: string, options: CreateOptions = {}): Promise<Archive> {
    const capacity = uint32(options.maxFileCount ?? 4096, "maxFileCount");
    if (capacity < 4 || capacity > 0x80000) throw new RangeError("maxFileCount must be between 4 and 524288");
    const destination = resolve(diskPath(path));
    const reservation = await open(destination, "wx");
    await reservation.close();
    const archive = new Archive(destination, true, "create", capacity);
    try {
      await archive.ready;
      return archive;
    } catch (error) {
      await archive.worker.terminate();
      await rm(destination, { force: true });
      throw error;
    }
  }

  get fileCount(): Promise<number> { return this.getFileCount(); }
  getFileCount(): Promise<number> { return this.enqueue(() => this.request("count", [])); }
  hasFile(path: string): Promise<boolean> { return this.enqueue(() => this.request("has", [archivePath(path)])); }
  list(): Promise<FileEntry[]> { return this.enqueue(() => this.request("list", [])); }

  async listTree(): Promise<TreeNode> {
    const root: TreeNode = { name: basename(this.path), path: "", type: "directory", children: [] };
    const directories = new Map<string, TreeNode>([["", root]]);
    for (const entry of await this.list()) {
      const parts = entry.name.replaceAll("\\", "/").split("/");
      let parent = root;
      let path = "";
      for (const part of parts.slice(0, -1)) {
        path = path ? `${path}/${part}` : part;
        const key = path.toUpperCase();
        let directory = directories.get(key);
        if (!directory) {
          directory = { name: part, path, type: "directory", children: [] };
          directories.set(key, directory);
          parent.children!.push(directory);
        }
        parent = directory;
      }
      parent.children!.push({ name: parts.at(-1)!, path: entry.name.replaceAll("\\", "/"), type: "file", entry });
    }
    const sort = (node: TreeNode): void => {
      node.children?.sort((left, right) => Number(right.type === "directory") - Number(left.type === "directory") || left.name.localeCompare(right.name));
      node.children?.forEach(sort);
    };
    sort(root);
    return root;
  }

  readFile(path: string, options: { maxBytes?: number } = {}): Promise<Buffer> {
    return this.enqueue(async () => {
      const bytes = await this.request<Uint8Array>("read", [archivePath(path), uint32(options.maxBytes ?? 256 * 1024 * 1024, "maxBytes")]);
      return Buffer.from(bytes);
    });
  }
  async readTextFile(path: string, encoding: BufferEncoding = "utf8"): Promise<string> {
    return (await this.readFile(path)).toString(encoding);
  }

  add(source: string | Buffer | Readable, options: AddOptions = {}): Promise<void> {
    return this.enqueue(async () => {
      this.assertWritable();
      const name = archivePath(options.archivePath ?? (typeof source === "string" ? basename(source) : ""));
      const compression = uint32(options.compression ?? Compression.ZLIB, "compression");
      let flags = compression ? 0x200 : 0;
      if (options.replace) flags |= 0x80000000;
      if (options.encrypt) flags |= 0x10000;
      let directory: string | undefined;
      try {
        let path: string;
        if (typeof source === "string") path = resolve(diskPath(source));
        else {
          directory = await mkdtemp(join(tmpdir(), "node-stormlib-add-"));
          path = join(directory, "file");
          if (Buffer.isBuffer(source)) await writeFile(path, source, { flag: "wx" });
          else await pipeline(source, createWriteStream(path, { flags: "wx" }));
        }
        await this.request("add", [path, name, flags >>> 0, compression]);
      } finally {
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    });
  }

  extract(path: string, destination: string, options: { overwrite?: boolean } = {}): Promise<void> {
    return this.enqueue(async () => {
      const target = resolve(diskPath(destination));
      if (target === this.path) throw new Error("Cannot extract over the open archive");
      await mkdir(dirname(target), { recursive: true });
      const temporary = join(dirname(target), `.${randomUUID()}.extract`);
      try {
        await this.request("extract", [archivePath(path), temporary]);
        if (options.overwrite) await rename(temporary, target);
        else await link(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }

  delete(path: string): Promise<void> {
    return this.enqueue(() => { this.assertWritable(); return this.request("delete", [archivePath(path)]); });
  }
  rename(path: string, newPath: string): Promise<void> {
    return this.enqueue(() => { this.assertWritable(); return this.request("rename", [archivePath(path), archivePath(newPath)]); });
  }
  save(destination?: string): Promise<void> {
    return this.enqueue(async () => {
      this.assertWritable();
      await this.request("flush", []);
      if (destination && resolve(diskPath(destination)) !== this.path) {
        await copyFile(this.path, resolve(destination), constants.COPYFILE_EXCL);
      }
    });
  }
  compact(): Promise<void> {
    return this.enqueue(() => { this.assertWritable(); return this.request("compact", []); });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.queue.then(async () => {
      try { await this.request("close", []); }
      finally {
        await this.worker.terminate();
        if (this.temporaryDirectory) await rm(this.temporaryDirectory, { recursive: true, force: true });
      }
    });
    return this.closePromise;
  }

  private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (this.closing) return Promise.reject(new Error("Archive is closing or closed"));
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private request<Result>(operation: string, args: unknown[]): Promise<Result> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolveReply, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve: value => resolveReply(value as Result), reject });
      this.worker.ref();
      try { this.worker.postMessage({ id, operation, args }); }
      catch (error) {
        this.pending.delete(id);
        reject(error);
        if (!this.pending.size) this.worker.unref();
      }
    });
  }
  private fail(error: Error) {
    this.failure = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
  private assertWritable() { if (!this.writable) throw new Error("Archive is read-only"); }
}

function diskPath(path: string): string {
  if (typeof path !== "string" || !path || path.includes("\0")) throw new TypeError("Expected a nonempty path without NUL");
  return path;
}
function archivePath(path: string): string {
  const normalized = diskPath(path).replaceAll("/", "\\");
  if (normalized.startsWith("\\") || /^[A-Za-z]:/.test(normalized) || normalized.split("\\").some(part => !part || part === "." || part === "..")) {
    throw new TypeError("Expected a relative archive path without traversal");
  }
  return normalized;
}
function uint32(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  return value;
}

export const openMpq = Archive.open;
export const createMpq = Archive.create;