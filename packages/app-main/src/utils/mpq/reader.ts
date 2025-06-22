import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { decompressMpqSector } from "./compression";
import {
  calculateFileKey,
  decryptBlock,
  hashString,
  MPQ_HASH,
  MPQ_HASH_ENTRY_DELETED,
  MPQ_HASH_ENTRY_FREE,
  normalizeMpqPath,
} from "./crypto";
import {
  MpqEncryptedFileError,
  MpqFileNotFoundError,
  MpqFormatError,
} from "./errors";
import {
  readClassicTables,
  readMpqHeader,
  type MpqBlockEntry,
  type MpqHashEntry,
  type MpqHeader,
} from "./format";
import type { MpqSource } from "./source";
import {
  MPQ_FILE_FLAGS,
  type MpqArchiveInfo,
  type MpqExtractOptions,
  type MpqFileEntry,
  type MpqOpenOptions,
  type MpqReadOptions,
  type MpqTreeNode,
} from "./types";

const INTERNAL_NAMES = ["(listfile)", "(attributes)", "(signature)"];

export class MpqReader {
  readonly info: MpqArchiveInfo;
  readonly header: MpqHeader;
  private readonly source: MpqSource;
  private readonly hashTable: MpqHashEntry[];
  private readonly blockTable: MpqBlockEntry[];
  private readonly namesByBlock = new Map<number, string>();

  private constructor(
    source: MpqSource,
    header: MpqHeader,
    hashTable: MpqHashEntry[],
    blockTable: MpqBlockEntry[],
  ) {
    this.source = source;
    this.header = header;
    this.hashTable = hashTable;
    this.blockTable = blockTable;
    this.info = {
      sourcePath: source.path,
      headerOffset: header.offset,
      archiveSize: header.archiveSize,
      formatVersion: header.formatVersion,
      sectorSize: 512 << header.sectorSizeShift,
      fileCount: countFiles(hashTable, blockTable),
      hashTableSize: hashTable.length,
      blockTableSize: blockTable.length,
      hasUserData: header.userData !== undefined,
    };
  }

  static async open(
    source: MpqSource,
    options: MpqOpenOptions = {},
  ): Promise<MpqReader> {
    const header = await readMpqHeader(
      source,
      options.maxHeaderSearchBytes,
    );
    const { hashTable, blockTable } = await readClassicTables(source, header);
    const reader = new MpqReader(source, header, hashTable, blockTable);
    await reader.loadNames(options.listfile);
    return reader;
  }

  get fileCount(): number {
    return this.info.fileCount;
  }

  async list(): Promise<MpqFileEntry[]> {
    const entries: MpqFileEntry[] = [];
    for (let hashIndex = 0; hashIndex < this.hashTable.length; hashIndex += 1) {
      const hash = this.hashTable[hashIndex];
      if (!isActiveHash(hash) || hash.blockIndex >= this.blockTable.length) continue;
      entries.push(
        this.toFileEntry(hashIndex, hash, this.blockTable[hash.blockIndex]),
      );
    }
    return entries;
  }

  async listTree(): Promise<MpqTreeNode> {
    const root: MpqTreeNode = {
      name: this.source.path?.split(/[\\/]/).at(-1) ?? "archive.mpq",
      path: "",
      type: "directory",
      children: [],
    };
    const directories = new Map<string, MpqTreeNode>([["", root]]);

    for (const entry of await this.list()) {
      if (!entry.name) continue;
      const path = entry.name.replaceAll("\\", "/");
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

    sortTree(root);
    return root;
  }

  async hasFile(path: string): Promise<boolean> {
    return this.findHashEntry(path) !== undefined;
  }

  async readFile(path: string, options: MpqReadOptions = {}): Promise<Buffer> {
    const found = this.findHashEntry(path);
    if (!found) throw new MpqFileNotFoundError(path);
    const block = this.blockTable[found.hash.blockIndex];
    if (options.maxBytes !== undefined && block.size > options.maxBytes) {
      throw new RangeError(
        `MPQ file exceeds the ${options.maxBytes} byte read limit: ${path}`,
      );
    }
    return this.readBlock(block, path);
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
    if (!options.overwrite) {
      const { access } = await import("node:fs/promises");
      try {
        await access(destination);
        throw new Error(`Destination already exists: ${destination}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await this.readFile(path));
  }

  async close(): Promise<void> {
    await this.source.close();
  }

  private async loadNames(externalNames: string[] = []): Promise<void> {
    for (const name of [...INTERNAL_NAMES, ...externalNames]) this.rememberName(name);
    const listfile = this.findHashEntry("(listfile)");
    if (!listfile) return;
    try {
      const content = (
        await this.readBlock(
          this.blockTable[listfile.hash.blockIndex],
          "(listfile)",
        )
      ).toString("utf8");
      for (const name of content.split(/\r?\n/)) {
        if (name.trim()) this.rememberName(name.trim());
      }
    } catch {
      // An invalid optional listfile must not prevent opening the archive.
    }
  }

  private rememberName(path: string) {
    const found = this.findHashEntry(path);
    if (found) this.namesByBlock.set(found.hash.blockIndex, path);
  }

  private findHashEntry(path: string) {
    const normalized = normalizeMpqPath(path);
    const start = hashString(normalized, MPQ_HASH.TABLE_INDEX) % this.hashTable.length;
    const hashA = hashString(normalized, MPQ_HASH.NAME_A);
    const hashB = hashString(normalized, MPQ_HASH.NAME_B);
    let fallback: { hashIndex: number; hash: MpqHashEntry } | undefined;

    for (let probe = 0; probe < this.hashTable.length; probe += 1) {
      const hashIndex = (start + probe) % this.hashTable.length;
      const hash = this.hashTable[hashIndex];
      if (hash.blockIndex === MPQ_HASH_ENTRY_FREE) break;
      if (
        hash.blockIndex !== MPQ_HASH_ENTRY_DELETED &&
        hash.nameHashA === hashA &&
        hash.nameHashB === hashB
      ) {
        if (hash.locale === 0) return { hashIndex, hash };
        fallback ??= { hashIndex, hash };
      }
    }
    return fallback;
  }

  private toFileEntry(
    hashIndex: number,
    hash: MpqHashEntry,
    block: MpqBlockEntry,
  ): MpqFileEntry {
    return {
      name: this.namesByBlock.get(hash.blockIndex),
      hashIndex,
      blockIndex: hash.blockIndex,
      locale: hash.locale,
      platform: hash.platform,
      offset: block.offset,
      compressedSize: block.compressedSize,
      size: block.size,
      flags: block.flags,
      isFile: Boolean(block.flags & MPQ_FILE_FLAGS.EXISTS),
      isCompressed: Boolean(
        block.flags & (MPQ_FILE_FLAGS.COMPRESS | MPQ_FILE_FLAGS.IMPLODE),
      ),
      isEncrypted: Boolean(block.flags & MPQ_FILE_FLAGS.ENCRYPTED),
      isSingleUnit: Boolean(block.flags & MPQ_FILE_FLAGS.SINGLE_UNIT),
    };
  }

  private async readBlock(block: MpqBlockEntry, path?: string): Promise<Buffer> {
    if (!(block.flags & MPQ_FILE_FLAGS.EXISTS)) {
      throw new MpqFileNotFoundError(path ?? "<unknown>");
    }
    const raw = await this.source.read(
      this.header.offset + block.offset,
      block.compressedSize,
    );
    if (raw.length !== block.compressedSize) {
      throw new MpqFormatError("Unexpected end of MPQ file data");
    }
    const encrypted = Boolean(block.flags & MPQ_FILE_FLAGS.ENCRYPTED);
    if (encrypted && !path) throw new MpqEncryptedFileError();
    const key = encrypted
      ? calculateFileKey(
          path!,
          block.offset,
          block.size,
          Boolean(block.flags & MPQ_FILE_FLAGS.FIX_KEY),
        )
      : 0;

    if (block.flags & MPQ_FILE_FLAGS.SINGLE_UNIT) {
      const data = encrypted ? decryptBlock(raw, key) : raw;
      return block.flags & (MPQ_FILE_FLAGS.COMPRESS | MPQ_FILE_FLAGS.IMPLODE)
        ? decompressMpqSector(data, block.size)
        : data.subarray(0, block.size);
    }

    if (!(block.flags & (MPQ_FILE_FLAGS.COMPRESS | MPQ_FILE_FLAGS.IMPLODE))) {
      return this.readUncompressedSectors(raw, block, key);
    }
    return this.readCompressedSectors(raw, block, key);
  }

  private readUncompressedSectors(
    raw: Buffer,
    block: MpqBlockEntry,
    key: number,
  ): Buffer {
    if (!(block.flags & MPQ_FILE_FLAGS.ENCRYPTED)) return raw.subarray(0, block.size);
    const sectors: Buffer[] = [];
    for (let offset = 0, index = 0; offset < block.size; index += 1) {
      const length = Math.min(this.info.sectorSize, block.size - offset);
      sectors.push(decryptBlock(raw.subarray(offset, offset + length), key + index));
      offset += length;
    }
    return Buffer.concat(sectors, block.size);
  }

  private readCompressedSectors(
    raw: Buffer,
    block: MpqBlockEntry,
    key: number,
  ): Buffer {
    if (block.flags & MPQ_FILE_FLAGS.IMPLODE) {
      throw new MpqFormatError("PKWARE implode compression is not supported");
    }
    const sectorCount = Math.ceil(block.size / this.info.sectorSize);
    const tableLength = (sectorCount + 1) * 4;
    if (raw.length < tableLength) throw new MpqFormatError("Invalid MPQ sector table");
    const table = block.flags & MPQ_FILE_FLAGS.ENCRYPTED
      ? decryptBlock(raw.subarray(0, tableLength), (key - 1) >>> 0)
      : raw.subarray(0, tableLength);
    const offsets = Array.from(
      { length: sectorCount + 1 },
      (_, index) => table.readUInt32LE(index * 4),
    );
    validateSectorOffsets(offsets, raw.length, tableLength);
    const sectors: Buffer[] = [];

    for (let index = 0; index < sectorCount; index += 1) {
      const expected = Math.min(
        this.info.sectorSize,
        block.size - index * this.info.sectorSize,
      );
      let data = raw.subarray(offsets[index], offsets[index + 1]);
      if (block.flags & MPQ_FILE_FLAGS.ENCRYPTED) {
        data = decryptBlock(data, (key + index) >>> 0);
      }
      sectors.push(decompressMpqSector(data, expected));
    }
    return Buffer.concat(sectors, block.size);
  }
}

function isActiveHash(hash: MpqHashEntry): boolean {
  return (
    hash.blockIndex !== MPQ_HASH_ENTRY_FREE &&
    hash.blockIndex !== MPQ_HASH_ENTRY_DELETED
  );
}

function countFiles(
  hashTable: MpqHashEntry[],
  blockTable: MpqBlockEntry[],
): number {
  const blocks = new Set<number>();
  for (const hash of hashTable) {
    if (
      isActiveHash(hash) &&
      hash.blockIndex < blockTable.length &&
      blockTable[hash.blockIndex].flags & MPQ_FILE_FLAGS.EXISTS
    ) {
      blocks.add(hash.blockIndex);
    }
  }
  return blocks.size;
}

function validateSectorOffsets(
  offsets: number[],
  rawLength: number,
  minimumFirstOffset: number,
) {
  if (offsets[0] < minimumFirstOffset || offsets.at(-1)! > rawLength) {
    throw new MpqFormatError("MPQ sector offsets are outside the file block");
  }
  for (let index = 1; index < offsets.length; index += 1) {
    if (offsets[index] < offsets[index - 1]) {
      throw new MpqFormatError("MPQ sector offsets are not monotonic");
    }
  }
}

function sortTree(node: MpqTreeNode) {
  node.children?.sort(
    (left, right) =>
      Number(right.type === "directory") - Number(left.type === "directory") ||
      left.name.localeCompare(right.name),
  );
  node.children?.forEach(sortTree);
}