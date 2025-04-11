import type { Readable } from "node:stream";

export type SevenZipCompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SevenZipProgress = {
  percent: number;
  file?: string;
};

export type SevenZipResult = {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SevenZipEntry = {
  path: string;
  size?: number;
  packedSize?: number;
  modified?: Date;
  attributes?: string;
  crc?: string;
  method?: string;
  isDirectory: boolean;
  properties: Record<string, string>;
};

export type SevenZipListResult = SevenZipResult & {
  entries: SevenZipEntry[];
};

export type SevenZipTreeNode = {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  packedSize?: number;
  modified?: Date;
  children?: SevenZipTreeNode[];
};

export type SevenZipCommonOptions = {
  password?: string;
  timeout?: number;
  cwd?: string;
  onProgress?: (progress: SevenZipProgress) => void;
};

export type SevenZipAddOptions = SevenZipCommonOptions & {
  archiveType?: string;
  compressionLevel?: SevenZipCompressionLevel;
  compressionMethod?: string;
  encryptFileNames?: boolean;
  recursive?: boolean;
  solid?: boolean;
  threads?: number;
  exclude?: string[];
};

export type SevenZipExtractOptions = SevenZipCommonOptions & {
  outputDir?: string;
  files?: string[];
  exclude?: string[];
  overwrite?: "overwrite" | "skip" | "rename" | "rename-existing";
  preservePaths?: boolean;
};

export type SevenZipListOptions = SevenZipCommonOptions & {
  files?: string[];
};

export type SevenZipReadFileOptions = SevenZipCommonOptions & {
  maxBytes?: number;
};

export type SevenZipWrapperOptions = {
  binaryPath?: string;
};

export type SevenZipRenamePair = readonly [source: string, destination: string];

export type SevenZipCommandApi = {
  add(
    archive: string,
    files: string | string[],
    options?: SevenZipAddOptions,
  ): Promise<SevenZipResult>;
  extract(
    archive: string,
    options?: SevenZipExtractOptions,
  ): Promise<SevenZipResult>;
  list(
    archive: string,
    options?: SevenZipListOptions,
  ): Promise<SevenZipListResult>;
  listTree(
    archive: string,
    options?: SevenZipListOptions,
  ): Promise<SevenZipTreeNode>;
  test(
    archive: string,
    options?: SevenZipCommonOptions,
  ): Promise<SevenZipResult>;
  delete(
    archive: string,
    files: string | string[],
    options?: SevenZipCommonOptions,
  ): Promise<SevenZipResult>;
  rename(
    archive: string,
    pairs: ReadonlyArray<SevenZipRenamePair>,
    options?: SevenZipCommonOptions,
  ): Promise<SevenZipResult>;
  hash(
    files: string | string[],
    algorithm?: string,
    options?: SevenZipCommonOptions,
  ): Promise<SevenZipResult>;
  extractToStream(
    archive: string,
    file: string,
    options?: SevenZipCommonOptions,
  ): Readable;
  extractToBuffer(
    archive: string,
    file: string,
    options?: SevenZipCommonOptions,
  ): Promise<Buffer>;
  readFile(
    archive: string,
    file: string,
    options?: SevenZipReadFileOptions,
  ): Promise<Buffer>;
  readTextFile(
    archive: string,
    file: string,
    encoding?: BufferEncoding,
    options?: SevenZipReadFileOptions,
  ): Promise<string>;
};
