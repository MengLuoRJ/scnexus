import type { Readable } from "node:stream";

export type MpqInput = string | Readable;

export type MpqOpenOptions = {
  writable?: boolean;
  listfile?: string[];
  tempDirectory?: string;
  maxHeaderSearchBytes?: number;
};

export type MpqCreateOptions = {
  sectorSizeShift?: number;
  hashTableSize?: number;
  userData?: Buffer;
};

export type MpqFileEntry = {
  name?: string;
  hashIndex: number;
  blockIndex: number;
  locale: number;
  platform: number;
  offset: bigint;
  compressedSize: number;
  size: number;
  flags: number;
  isFile: boolean;
  isCompressed: boolean;
  isEncrypted: boolean;
  isSingleUnit: boolean;
};

export type MpqTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  entry?: MpqFileEntry;
  children?: MpqTreeNode[];
};

export type MpqAddOptions = {
  archivePath?: string;
  compress?: boolean;
  encrypt?: boolean;
  replace?: boolean;
  locale?: number;
  platform?: number;
};

export type MpqExtractOptions = {
  overwrite?: boolean;
};

export type MpqReadOptions = {
  maxBytes?: number;
};

export type MpqArchiveInfo = {
  sourcePath?: string;
  headerOffset: bigint;
  archiveSize: bigint;
  formatVersion: number;
  sectorSize: number;
  fileCount: number;
  hashTableSize: number;
  blockTableSize: number;
  hasUserData: boolean;
};

export interface MpqArchiveApi {
  readonly info: MpqArchiveInfo;
  readonly fileCount: number;
  list(): Promise<MpqFileEntry[]>;
  listTree(): Promise<MpqTreeNode>;
  hasFile(path: string): Promise<boolean>;
  readFile(path: string, options?: MpqReadOptions): Promise<Buffer>;
  readTextFile(
    path: string,
    encoding?: BufferEncoding,
    options?: MpqReadOptions,
  ): Promise<string>;
  extract(
    path: string,
    destination: string,
    options?: MpqExtractOptions,
  ): Promise<void>;
  add(source: string | Buffer | Readable, options: MpqAddOptions): Promise<void>;
  delete(path: string): Promise<void>;
  rename(path: string, newPath: string): Promise<void>;
  save(destination?: string): Promise<void>;
  close(): Promise<void>;
}

export const MPQ_FILE_FLAGS = {
  IMPLODE: 0x00000100,
  COMPRESS: 0x00000200,
  ENCRYPTED: 0x00010000,
  FIX_KEY: 0x00020000,
  PATCH_FILE: 0x00100000,
  SINGLE_UNIT: 0x01000000,
  DELETE_MARKER: 0x02000000,
  SECTOR_CRC: 0x04000000,
  EXISTS: 0x80000000,
} as const;

export const MPQ_COMPRESSION = {
  HUFFMAN: 0x01,
  ZLIB: 0x02,
  PKWARE: 0x08,
  BZIP2: 0x10,
  SPARSE: 0x20,
  ADPCM_MONO: 0x40,
  ADPCM_STEREO: 0x80,
} as const;