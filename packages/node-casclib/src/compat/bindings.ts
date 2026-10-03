/**
 * Low-level native bindings for CascLib.
 *
 * Method names on these interfaces match the upstream C function names
 * exactly (see BINDING_NAMING_CONVENTION.md). Helpers that have no upstream
 * equivalent (e.g. `fileExists`, `readFileAll`, `openAsync`) use camelCase.
 *
 * Most consumers should use the high-level `Storage` / `File` classes from
 * the package entry point instead.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
export const native = require("../../build/Release/casclib_bindings.node");

// Storage info classes
export enum CascStorageInfoClass {
  LocalFileCount = 0,
  TotalFileCount = 1,
  Features = 2,
  InstalledLocales = 3,
  Product = 4,
  Tags = 5,
  PathProduct = 6,
}

// File info classes
export enum CascFileInfoClass {
  ContentKey = 0,
  EncodedKey = 1,
  FullInfo = 2,
  SpanInfo = 3,
}

// Name type enum
export enum CascNameType {
  Full = 0,
  DataId = 1,
  CKey = 2,
  EKey = 3,
}

// Find data structure
export interface CascFindData {
  fileName: string;
  ckey: Buffer;
  ekey: Buffer;
  tagBitMask: number;
  fileSize: number;
  plainName: string | null;
  fileDataId: number;
  localeFlags: number;
  contentFlags: number;
  spanCount: number;
  available: boolean;
  nameType: CascNameType;
}

// Storage product info
export interface CascStorageProductData {
  codeName: string;
  buildNumber: number;
}

// Storage info result
export interface CascStorageInfo {
  fileCount?: number;
  features?: number;
  codeName?: string;
  buildNumber?: number;
}

// File full info
export interface CascFileFullInfoData {
  ckey: Buffer;
  ekey: Buffer;
  dataFileName: string;
  storageOffset: number | bigint;
  segmentOffset: number | bigint;
  tagBitMask: number | bigint;
  fileNameHash: number | bigint;
  contentSize: number | bigint;
  encodedSize: number | bigint;
  segmentIndex: number;
  spanCount: number;
  fileDataId: number;
  localeFlags: number;
  contentFlags: number;
}

// File span info
export interface CascFileSpanInfoData {
  ckey: Buffer;
  ekey: Buffer;
  startOffset: number;
  endOffset: number;
  archiveIndex: number;
  archiveOffs: number;
  headerSize: number;
  frameCount: number;
}

// File info result
export interface CascFileInfoResult {
  ckey?: Buffer;
  ekey?: Buffer;
  dataFileName?: string;
  storageOffset?: number | bigint;
  segmentOffset?: number | bigint;
  tagBitMask?: number | bigint;
  fileNameHash?: number | bigint;
  contentSize?: number | bigint;
  encodedSize?: number | bigint;
  segmentIndex?: number;
  spanCount?: number;
  fileDataId?: number;
  localeFlags?: number;
  contentFlags?: number;
}

export interface CascOpenStorageExOptions {
  localPath?: string;
  codeName?: string;
  region?: string;
  localeMask?: number;
  flags?: number;
  buildKey?: string;
  cdnHostUrl?: string;
  online?: boolean;
}

export interface CascStorage {
  // Basic operations
  CascOpenStorage(path: string, flags: number): boolean;
  CascOpenOnlineStorage(path: string, flags: number): boolean;
  CascOpenStorageEx(
    params: string,
    options?: CascOpenStorageExOptions,
  ): boolean;
  CascCloseStorage(): boolean;

  // Async helpers (no upstream equivalent — run on a libuv worker thread)
  openAsync(path: string, flags: number): Promise<boolean>;
  openOnlineAsync(path: string, flags: number): Promise<boolean>;

  // File operations
  CascOpenFile(filename: string, flags: number): CascFile;
  CascGetFileInfo(filename: string): { name: string; size: number } | null;
  fileExists(filename: string): boolean; // Helper function, not in CascLib.h

  // Storage info
  CascGetStorageInfo(infoClass: number): CascStorageInfo;

  // Find operations
  CascFindFirstFile(mask?: string, listFile?: string): CascFindData | null;
  CascFindNextFile(): CascFindData | null;
  CascFindClose(): boolean;

  // Encryption key operations
  CascAddEncryptionKey(keyName: number | bigint, key: Buffer): boolean;
  CascAddStringEncryptionKey(keyName: number | bigint, keyStr: string): boolean;
  CascImportKeysFromString(keyList: string): boolean;
  CascImportKeysFromFile(filePath: string): boolean;
  CascFindEncryptionKey(keyName: number | bigint): Buffer | null;
  CascGetNotFoundEncryptionKey(): number | bigint | null;
}

export interface CascFile {
  // Basic read operations
  CascReadFile(bytesToRead: number): Buffer;
  readFileAll(): Buffer; // Helper function, not in CascLib.h
  readAllAsync(): Promise<Buffer>; // Helper function, worker-thread variant

  // Size operations
  CascGetFileSize(): number;
  CascGetFileSize64(): number | bigint;

  // Position operations
  CascGetFilePointer(): number; // Helper function, uses CascSetFilePointer
  CascGetFilePointer64(): number | bigint; // Helper function, uses CascSetFilePointer64
  CascSetFilePointer(position: number): number;
  CascSetFilePointer64(
    position: number | bigint,
    moveMethod?: number,
  ): number | bigint;

  // File info and flags
  CascGetFileInfo(infoClass: number): CascFileInfoResult;
  CascSetFileFlags(flags: number): boolean;

  // Close
  CascCloseFile(): boolean;
}

export const CascStorageBinding: new () => CascStorage = native.Storage;
export const CascFileBinding: new () => CascFile = native.File;

// Utility functions
export const CascOpenLocalFile: (filename: string, flags?: number) => CascFile =
  native.CascOpenLocalFile;
export const GetCascError: () => number = native.GetCascError;
export const SetCascError: (error: number) => void = native.SetCascError;

// CDN functions
export const CascCdnGetDefault: () => string | null = native.CascCdnGetDefault;
export const CascCdnDownload: (
  cdnHostUrl: string,
  product: string,
  fileName: string,
) => Buffer | null = native.CascCdnDownload;
