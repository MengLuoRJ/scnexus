import * as fs from 'fs'
import * as nodePath from 'path'
import {
  CascStorageBinding,
  CascFindData,
  CascStorageInfo,
  CascOpenStorageExOptions,
  CascStorage,
} from './bindings.js'
import { invoke, invokeAsync } from './errors.js'
import { kDispose } from './dispose.js'
import { File } from './file.js'

/**
 * Options for opening a CASC storage
 */
export interface StorageOpenOptions {
  /** Flags for opening the storage */
  flags?: number
}

/**
 * Information about a file in CASC storage
 */
export interface FileInfo {
  /** File name */
  name: string
  /** File size in bytes */
  size: number
}

/**
 * Options for opening a file from storage
 */
export interface FileOpenOptions {
  /** Open flags */
  flags?: number
}

/**
 * CascLib Storage wrapper class
 * Provides methods to interact with CASC storage archives.
 *
 * Prefer the static factories, which return an already-opened storage:
 * ```typescript
 * const storage = Storage.open('C:/Games/Heroes of the Storm');
 * const online  = await Storage.openOnlineAsync('/tmp/casc-cache*hero');
 * ```
 */
export class Storage {
  private storage: CascStorage
  private opened = false

  constructor() {
    this.storage = new CascStorageBinding()
  }

  // ---------------------------------------------------------------------------
  // Static factories
  // ---------------------------------------------------------------------------

  /**
   * Open a local CASC storage and return the opened Storage.
   * @param path - Path to the CASC storage directory
   * @param options - Optional opening options
   */
  static open(path: string, options?: StorageOpenOptions): Storage {
    const storage = new Storage()
    storage.open(path, options)
    return storage
  }

  /**
   * Open a local CASC storage on a worker thread (does not block the event loop).
   * @param path - Path to the CASC storage directory
   * @param options - Optional opening options
   */
  static async openAsync(path: string, options?: StorageOpenOptions): Promise<Storage> {
    const storage = new Storage()
    await storage.openAsync(path, options)
    return storage
  }

  /**
   * Open an online CASC storage and return the opened Storage.
   * @param connection - Connection string, see {@link Storage.openOnline}
   * @param options - Optional opening options
   */
  static openOnline(connection: string, options?: StorageOpenOptions): Storage {
    const storage = new Storage()
    storage.openOnline(connection, options)
    return storage
  }

  /**
   * Open an online CASC storage on a worker thread.
   *
   * Strongly preferred over the sync variant: opening an online storage
   * downloads manifests/indexes from Blizzard's CDN and can block for minutes.
   * @param connection - Connection string, see {@link Storage.openOnline}
   * @param options - Optional opening options
   */
  static async openOnlineAsync(connection: string, options?: StorageOpenOptions): Promise<Storage> {
    const storage = new Storage()
    await storage.openOnlineAsync(connection, options)
    return storage
  }

  /**
   * Open a CASC storage with extended parameters and return the opened Storage.
   * @param params - Path or parameter string
   * @param options - Extended opening options
   */
  static openEx(params: string, options?: CascOpenStorageExOptions): Storage {
    const storage = new Storage()
    storage.openEx(params, options)
    return storage
  }

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------

  /** Whether the storage is currently open. */
  get isOpen(): boolean {
    return this.opened
  }

  /**
   * Open a CASC storage at the specified path
   * @param path - Path to the CASC storage directory
   * @param options - Optional opening options
   */
  open(path: string, options?: StorageOpenOptions): void {
    invoke(() => this.storage.CascOpenStorage(path, options?.flags || 0))
    this.opened = true
  }

  /**
   * Open a CASC storage on a worker thread (does not block the event loop).
   * @param path - Path to the CASC storage directory
   * @param options - Optional opening options
   */
  async openAsync(path: string, options?: StorageOpenOptions): Promise<void> {
    await invokeAsync(this.storage.openAsync(path, options?.flags || 0))
    this.opened = true
  }

  /**
   * Open an online CASC storage
   * @param connection - Connection string in the format: `local_cache_folder[*cdn_server_url]*code_name[*region]`
   *   - `local_cache_folder`: Local cache directory for downloaded game data (reusable)
   *     - Windows: `C:/Temp/CASC/Cache`
   *     - Linux: `/tmp/casc/cache`
   *   - `cdn_server_url`: Optional CDN server URL (e.g., "http://us.patch.battle.net:1119")
   *   - `code_name`: TACT product code (e.g., "hero" for Heroes of the Storm, "wow" for World of Warcraft)
   *     See https://wowdev.wiki/TACT for available product codes
   *   - `region`: Optional server region (e.g., "us", "eu", "kr", "tw", "cn")
   * @param options - Optional opening options
   * @example
   * ```typescript
   * // Windows - Basic usage with minimal parameters
   * storage.openOnline('C:/Temp/CASC/Cache*hero');
   *
   * // Linux - Basic usage
   * storage.openOnline('/tmp/casc/cache*hero');
   *
   * // With CDN server specified
   * storage.openOnline('C:/Temp/CASC/Cache*http://us.patch.battle.net:1119*hero');
   *
   * // With region specified
   * storage.openOnline('/tmp/casc/cache*hero*us');
   *
   * // Full format with all parameters
   * storage.openOnline('C:/Temp/CASC/Cache*http://us.patch.battle.net:1119*hero*us');
   * ```
   */
  openOnline(connection: string, options?: StorageOpenOptions): void {
    invoke(() => this.storage.CascOpenOnlineStorage(connection, options?.flags || 0))
    this.opened = true
  }

  /**
   * Open an online CASC storage on a worker thread (does not block the event loop).
   * See {@link Storage.openOnline} for the connection string format.
   */
  async openOnlineAsync(connection: string, options?: StorageOpenOptions): Promise<void> {
    await invokeAsync(this.storage.openOnlineAsync(connection, options?.flags || 0))
    this.opened = true
  }

  /**
   * Open a CASC storage with extended parameters (CascOpenStorageEx)
   * @param params - Path or parameter string
   * @param options - Extended opening options
   */
  openEx(params: string, options?: CascOpenStorageExOptions): void {
    invoke(() => this.storage.CascOpenStorageEx(params, options))
    this.opened = true
  }

  /**
   * Close the CASC storage
   */
  close(): boolean {
    this.opened = false
    return this.storage.CascCloseStorage()
  }

  // ---------------------------------------------------------------------------
  // File access
  // ---------------------------------------------------------------------------

  /**
   * Open a file from the storage
   * @param filename - Name of the file to open
   * @param options - Optional opening options
   * @returns A File object
   */
  openFile(filename: string, options?: FileOpenOptions): File {
    const file = invoke(() => this.storage.CascOpenFile(filename, options?.flags || 0))
    return new File(file)
  }

  /**
   * Get information about a file
   * @param filename - Name of the file
   * @returns File information or null if file doesn't exist
   */
  getFileInfo(filename: string): FileInfo | null {
    return invoke(() => this.storage.CascGetFileInfo(filename))
  }

  /**
   * Check if a file exists in the storage
   * @param filename - Name of the file
   * @returns true if file exists, false otherwise
   */
  fileExists(filename: string): boolean {
    return invoke(() => this.storage.fileExists(filename))
  }

  /**
   * Alias for fileExists — symmetry with stormlib's Archive.hasFile()
   */
  hasFile(filename: string): boolean {
    return this.fileExists(filename)
  }

  /**
   * Read a file from storage and return it as a Buffer.
   * Opens and closes the file internally.
   */
  readFile(filename: string, options?: FileOpenOptions): Buffer {
    const file = this.openFile(filename, options)
    try {
      return file.readAll()
    } finally {
      file.close()
    }
  }

  /**
   * Read a file from storage on a worker thread (does not block the event loop).
   * Opens and closes the file internally.
   */
  async readFileAsync(filename: string, options?: FileOpenOptions): Promise<Buffer> {
    const file = this.openFile(filename, options)
    try {
      return await file.readAllAsync()
    } finally {
      file.close()
    }
  }

  /**
   * Read a file from storage as a string.
   * @param encoding Buffer encoding (default 'utf-8').
   */
  readFileAsString(filename: string, encoding: BufferEncoding = 'utf-8'): string {
    return this.readFile(filename).toString(encoding)
  }

  /**
   * Read a file from storage and parse as JSON.
   */
  readFileAsJson<T = unknown>(filename: string): T {
    return JSON.parse(this.readFileAsString(filename, 'utf-8')) as T
  }

  /**
   * Read a file from storage as a string on a worker thread
   * (does not block the event loop).
   * @param encoding Buffer encoding (default 'utf-8').
   */
  async readFileAsStringAsync(
    filename: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<string> {
    return (await this.readFileAsync(filename)).toString(encoding)
  }

  /**
   * Get the size of a file in storage without reading its contents.
   * Throws CascError if the file does not exist.
   */
  getFileSize(filename: string): number | bigint {
    const file = this.openFile(filename)
    try {
      return file.getSize64()
    } finally {
      file.close()
    }
  }

  /**
   * Extract a file from storage to a path on disk.
   * Returns the number of bytes written.
   */
  extractFile(filename: string, destination: string): number {
    const buf = this.readFile(filename)
    fs.writeFileSync(destination, buf)
    return buf.length
  }

  /**
   * Extract a file from storage to a path on disk without blocking the
   * event loop. Returns the number of bytes written.
   */
  async extractFileAsync(filename: string, destination: string): Promise<number> {
    const buf = await this.readFileAsync(filename)
    await fs.promises.writeFile(destination, buf)
    return buf.length
  }

  // ---------------------------------------------------------------------------
  // Storage info
  // ---------------------------------------------------------------------------

  /**
   * Get storage information
   * @param infoClass - The type of information to retrieve
   * @returns Storage information object
   */
  getStorageInfo(infoClass: number): CascStorageInfo {
    return invoke(() => this.storage.CascGetStorageInfo(infoClass))
  }

  /**
   * Get the total file count from the storage info.
   * Convenience wrapper over getStorageInfo(CascStorageTotalFileCount).
   */
  getTotalFileCount(): number {
    const info = this.getStorageInfo(1 /* CascStorageTotalFileCount */)
    return info.fileCount ?? 0
  }

  /**
   * Get the product code name and build number of the storage.
   * Convenience wrapper over getStorageInfo(CascStorageProduct).
   *
   * @example
   * ```typescript
   * const { codeName, buildNumber } = storage.getProductInfo();
   * // { codeName: 'hero', buildNumber: 93571 }
   * ```
   */
  getProductInfo(): { codeName: string; buildNumber: number } {
    const info = this.getStorageInfo(4 /* CascStorageProduct */)
    return {
      codeName: info.codeName ?? '',
      buildNumber: info.buildNumber ?? 0,
    }
  }

  // ---------------------------------------------------------------------------
  // File enumeration
  // ---------------------------------------------------------------------------

  /**
   * Find the first file matching the mask
   * @param mask - File mask (e.g., "*.txt")
   * @param listFile - Optional list file path
   * @returns Find data or null if no files found
   */
  findFirstFile(mask?: string, listFile?: string): CascFindData | null {
    return invoke(() => this.storage.CascFindFirstFile(mask, listFile))
  }

  /**
   * Find the next file in the search
   * @returns Find data or null if no more files
   */
  findNextFile(): CascFindData | null {
    return invoke(() => this.storage.CascFindNextFile())
  }

  /**
   * Close the current find operation
   * @returns true if closed successfully
   */
  findClose(): boolean {
    return this.storage.CascFindClose()
  }

  /**
   * Lazily iterate files matching a mask. The underlying find handle is
   * closed automatically, including on early `break`.
   *
   * @example
   * ```typescript
   * for (const entry of storage.files('*.txt')) {
   *   console.log(entry.fileName, entry.fileSize);
   * }
   * ```
   */
  *files(mask: string = '*', listFile?: string): IterableIterator<CascFindData> {
    let entry = this.findFirstFile(mask, listFile)
    if (!entry) return
    try {
      do {
        yield entry
      } while ((entry = this.findNextFile()))
    } finally {
      this.findClose()
    }
  }

  /**
   * Iterating a Storage yields every file in it (mask "*").
   */
  [Symbol.iterator](): IterableIterator<CascFindData> {
    return this.files()
  }

  /**
   * Find all files matching a mask, returning an array.
   * Wraps the stateful findFirstFile/findNextFile/findClose loop.
   */
  findAllFiles(mask: string = '*', listFile?: string): CascFindData[] {
    return [...this.files(mask, listFile)]
  }

  /**
   * Get all file names matching a mask.
   */
  getFileNames(mask: string = '*'): string[] {
    return this.findAllFiles(mask).map((f) => f.fileName)
  }

  /**
   * Invoke a callback for each file matching a mask.
   * Iteration stops if the callback returns false.
   */
  forEachFile(mask: string, callback: (entry: CascFindData) => boolean | void): void {
    for (const entry of this.files(mask)) {
      if (callback(entry) === false) return
    }
  }

  /**
   * Find all files whose name matches a regular expression.
   * Enumerates the whole storage and filters client-side — replaces the
   * manual findFirstFile/findNextFile loop. For simple wildcard patterns,
   * prefer findAllFiles(mask), which filters natively.
   *
   * @example
   * ```typescript
   * const maps = storage.findFilesMatching(/\.stormmap$/i);
   * console.log(`Found ${maps.length} files`);
   * ```
   */
  findFilesMatching(pattern: RegExp, listFile?: string): CascFindData[] {
    return this.findAllFiles('*', listFile).filter((f) => pattern.test(f.fileName))
  }

  /**
   * Extract every file matching a CASC mask (string) or regular expression
   * to a directory, preserving the storage's directory structure.
   * Files that cannot be extracted (e.g. encrypted without keys) are
   * skipped and reported in `failed`.
   *
   * @param outputDir - Output directory (subdirectories are created as needed)
   * @param pattern - CASC mask like `"*.txt"` or a RegExp tested against fileName (default: all files)
   * @returns The file names that were extracted and the ones that failed
   *
   * @example
   * ```typescript
   * const { extracted, failed } = storage.extractFiles('./out', /\.xml$/i);
   * console.log(`Extracted ${extracted.length} files (${failed.length} failed)`);
   * ```
   */
  extractFiles(
    outputDir: string,
    pattern: string | RegExp = '*',
  ): { extracted: string[]; failed: string[] } {
    const entries =
      typeof pattern === 'string' ? this.findAllFiles(pattern) : this.findFilesMatching(pattern)
    const extracted: string[] = []
    const failed: string[] = []
    for (const entry of entries) {
      const destination = Storage.safeDestination(outputDir, entry.fileName)
      if (!destination) {
        failed.push(entry.fileName)
        continue
      }
      try {
        fs.mkdirSync(nodePath.dirname(destination), { recursive: true })
        this.extractFile(entry.fileName, destination)
        extracted.push(entry.fileName)
      } catch {
        failed.push(entry.fileName)
      }
    }
    return { extracted, failed }
  }

  /**
   * Like extractFiles, but reads and writes on worker threads without
   * blocking the event loop. Files are extracted sequentially — a storage
   * handle must not run concurrent operations.
   */
  async extractFilesAsync(
    outputDir: string,
    pattern: string | RegExp = '*',
  ): Promise<{ extracted: string[]; failed: string[] }> {
    const entries =
      typeof pattern === 'string' ? this.findAllFiles(pattern) : this.findFilesMatching(pattern)
    const extracted: string[] = []
    const failed: string[] = []
    for (const entry of entries) {
      const destination = Storage.safeDestination(outputDir, entry.fileName)
      if (!destination) {
        failed.push(entry.fileName)
        continue
      }
      try {
        await fs.promises.mkdir(nodePath.dirname(destination), {
          recursive: true,
        })
        await this.extractFileAsync(entry.fileName, destination)
        extracted.push(entry.fileName)
      } catch {
        failed.push(entry.fileName)
      }
    }
    return { extracted, failed }
  }

  /**
   * Map a storage file name to a destination path inside outputDir,
   * or null if the name would escape it. Storage names come from CASC
   * metadata and are untrusted: reject `..` segments and drive letters,
   * then verify the resolved path stays under the output root (zip-slip
   * guard).
   */
  private static safeDestination(outputDir: string, fileName: string): string | null {
    const parts = fileName.split(/[\\/]+/).filter((p) => p && p !== '.')
    if (parts.length === 0 || parts.some((p) => p === '..' || /^[a-zA-Z]:$/.test(p))) return null
    const destination = nodePath.resolve(outputDir, ...parts)
    const root = nodePath.resolve(outputDir) + nodePath.sep
    if (!destination.startsWith(root)) return null
    return destination
  }

  // ---------------------------------------------------------------------------
  // Encryption keys
  // ---------------------------------------------------------------------------

  /**
   * Add an encryption key to the storage
   * @param keyName - Name/ID of the key
   * @param key - Key data as Buffer
   * @returns true if added successfully
   */
  addEncryptionKey(keyName: number | bigint, key: Buffer): boolean {
    return invoke(() => this.storage.CascAddEncryptionKey(keyName, key))
  }

  /**
   * Add an encryption key from a string
   * @param keyName - Name/ID of the key
   * @param keyStr - Key as string
   * @returns true if added successfully
   */
  addStringEncryptionKey(keyName: number | bigint, keyStr: string): boolean {
    return invoke(() => this.storage.CascAddStringEncryptionKey(keyName, keyStr))
  }

  /**
   * Import encryption keys from a string
   * @param keyList - String containing key list
   * @returns true if imported successfully
   */
  importKeysFromString(keyList: string): boolean {
    return invoke(() => this.storage.CascImportKeysFromString(keyList))
  }

  /**
   * Import encryption keys from a file
   * @param filePath - Path to the key file
   * @returns true if imported successfully
   */
  importKeysFromFile(filePath: string): boolean {
    return invoke(() => this.storage.CascImportKeysFromFile(filePath))
  }

  /**
   * Find an encryption key by name
   * @param keyName - Name/ID of the key
   * @returns Key data or null if not found
   */
  findEncryptionKey(keyName: number | bigint): Buffer | null {
    return invoke(() => this.storage.CascFindEncryptionKey(keyName))
  }

  /**
   * Get the name of an encryption key that was not found
   * @returns Key name or null
   */
  getNotFoundEncryptionKey(): number | bigint | null {
    return invoke(() => this.storage.CascGetNotFoundEncryptionKey())
  }

  /**
   * Symbol.dispose support for `using` blocks (TS 5.2+).
   */
  [kDispose](): void {
    this.close()
  }
}

/**
 * Open a storage, run a callback, and guarantee close() — even on throw.
 * Mirrors the pattern of `using` blocks for environments without TC39 disposal.
 *
 * @example
 *   const buildId = withStorage(
 *     s => { s.openOnline('/tmp/cache*hero'); return s.readFileAsString('buildid.txt'); }
 *   );
 */
export function withStorage<T>(fn: (storage: Storage) => T): T {
  const storage = new Storage()
  try {
    return fn(storage)
  } finally {
    try {
      storage.close()
    } catch {
      /* already closed */
    }
  }
}

/**
 * Async variant of {@link withStorage} — awaits the callback before closing.
 *
 * @example
 *   const buildId = await withStorageAsync(async s => {
 *     await s.openOnlineAsync('/tmp/cache*hero');
 *     return s.readFileAsString('buildid.txt');
 *   });
 */
export async function withStorageAsync<T>(fn: (storage: Storage) => Promise<T>): Promise<T> {
  const storage = new Storage()
  try {
    return await fn(storage)
  } finally {
    try {
      storage.close()
    } catch {
      /* already closed */
    }
  }
}
