import * as fs from 'fs'
import * as path from 'path'
import { MPQArchiveBinding, MPQArchive, FileInfo } from './bindings.js'
import { invoke, invokeAsync } from './errors.js'
import { kDispose } from './dispose.js'
import { File } from './file.js'
import { MPQ_FILE_COMPRESS, MPQ_FILE_REPLACEEXISTING, MPQ_COMPRESSION_ZLIB } from './constants.js'

/**
 * Options for opening an MPQ archive
 */
export interface ArchiveOpenOptions {
  /** Flags for opening the archive */
  flags?: number
}

/**
 * Options for creating an MPQ archive
 */
export interface ArchiveCreateOptions {
  /** Maximum number of files the archive can contain */
  maxFileCount?: number
  /** Creation flags */
  flags?: number
}

/**
 * Options for opening a file from archive
 */
export interface FileOpenOptions {
  /** Open flags */
  flags?: number
}

/**
 * Options for opening a nested MPQ archive stored as a file inside another archive
 */
export interface FileArchiveOpenOptions {
  /** Archive priority (used when the nested archive participates in a patch chain) */
  priority?: number
  /** Open flags */
  flags?: number
}

/**
 * Options for adding a file to archive
 */
export interface AddFileOptions {
  /** File flags (compression, encryption, etc.) */
  flags?: number
  /** Compression method for first sector */
  compression?: number
  /** Compression method for subsequent sectors */
  compressionNext?: number
}

/**
 * Options for adding in-memory data to an archive
 */
export interface AddBufferOptions {
  /** File flags (default: MPQ_FILE_COMPRESS | MPQ_FILE_REPLACEEXISTING) */
  flags?: number
  /** Compression method (default: MPQ_COMPRESSION_ZLIB) */
  compression?: number
  /** File timestamp (default: 0) */
  fileTime?: number
  /** Locale ID (default: 0) */
  locale?: number
}

/**
 * StormLib Archive wrapper class
 * Provides methods to interact with MPQ archive files.
 *
 * Prefer the static factories, which return an already-opened archive:
 * ```typescript
 * const archive = Archive.open('/path/to/war3map.w3x');
 * const fresh   = Archive.create('/tmp/new.mpq', { maxFileCount: 100 });
 * ```
 */
export class Archive {
  private archive: MPQArchive
  private opened = false

  /**
   * @param archive - @internal — wraps an already-open native archive (used
   * by `openFileArchive()` / `openFileArchiveAsync()`). Omit to create a
   * fresh, unopened Archive via the usual `open()`/`create()` calls.
   */
  constructor(archive?: MPQArchive) {
    this.archive = archive ?? new MPQArchiveBinding()
    this.opened = archive !== undefined
  }

  // ---------------------------------------------------------------------------
  // Static factories and locale
  // ---------------------------------------------------------------------------

  /**
   * Open an MPQ archive and return the opened Archive.
   * @param archivePath - Path to the MPQ archive file
   * @param options - Optional opening options
   */
  static open(archivePath: string, options?: ArchiveOpenOptions): Archive {
    const archive = new Archive()
    archive.open(archivePath, options)
    return archive
  }

  /**
   * Open an MPQ archive on a worker thread (does not block the event loop).
   * @param archivePath - Path to the MPQ archive file
   * @param options - Optional opening options
   */
  static async openAsync(archivePath: string, options?: ArchiveOpenOptions): Promise<Archive> {
    const archive = new Archive()
    await archive.openAsync(archivePath, options)
    return archive
  }

  /**
   * Create a new MPQ archive and return the opened Archive.
   * @param archivePath - Path for the new archive
   * @param options - Optional creation options
   */
  static create(archivePath: string, options?: ArchiveCreateOptions): Archive {
    const archive = new Archive()
    archive.create(archivePath, options)
    return archive
  }

  /**
   * Get the current locale setting
   * This is a static method that affects all archive operations
   */
  static getLocale(): number {
    return MPQArchiveBinding.SFileGetLocale()
  }

  /**
   * Set the locale for archive operations
   * This is a static method that affects all archive operations
   * @param locale - The locale ID to set
   * @returns The locale ID that is now in effect
   */
  static setLocale(locale: number): number {
    return MPQArchiveBinding.SFileSetLocale(locale)
  }

  // ---------------------------------------------------------------------------
  // Open / create / close
  // ---------------------------------------------------------------------------

  /** Whether the archive is currently open. */
  get isOpen(): boolean {
    return this.opened
  }

  /**
   * Open an MPQ archive at the specified path
   * @param archivePath - Path to the MPQ archive file
   * @param options - Optional opening options
   */
  open(archivePath: string, options?: ArchiveOpenOptions): void {
    invoke(() => this.archive.SFileOpenArchive(archivePath, options?.flags || 0))
    this.opened = true
  }

  /**
   * Open an MPQ archive on a worker thread (does not block the event loop).
   * @param archivePath - Path to the MPQ archive file
   * @param options - Optional opening options
   */
  async openAsync(archivePath: string, options?: ArchiveOpenOptions): Promise<void> {
    await invokeAsync(this.archive.openAsync(archivePath, options?.flags || 0))
    this.opened = true
  }

  /**
   * Create a new MPQ archive
   * @param archivePath - Path for the new archive
   * @param options - Optional creation options
   */
  create(archivePath: string, options?: ArchiveCreateOptions): void {
    invoke(() =>
      this.archive.SFileCreateArchive(
        archivePath,
        options?.maxFileCount || 1000,
        options?.flags || 0,
      ),
    )
    this.opened = true
  }

  /**
   * Close the MPQ archive
   */
  close(): boolean {
    this.opened = false
    return this.archive.SFileCloseArchive()
  }

  /**
   * Flush any pending changes to disk
   * @returns true if successful
   */
  flush(): boolean {
    return invoke(() => this.archive.SFileFlushArchive())
  }

  /**
   * Compact the archive to remove unused space
   * @returns true if successful
   */
  compact(): boolean {
    return invoke(() => this.archive.SFileCompactArchive())
  }

  // ---------------------------------------------------------------------------
  // File access
  // ---------------------------------------------------------------------------

  /**
   * Open a file from the archive
   * @param filename - Name of the file to open
   * @param options - Optional opening options
   * @returns A File object
   */
  openFile(filename: string, options?: FileOpenOptions): File {
    const file = invoke(() => this.archive.SFileOpenFileEx(filename, options?.flags || 0))
    return new File(file)
  }

  /**
   * Open an MPQ archive that is itself stored as a file inside this archive
   * (a nested/embedded archive). The returned Archive owns an independent
   * handle — close it separately from the archive it was opened from.
   * @param fileName - Name of the nested archive file within this archive
   * @param options - Optional priority and open flags
   * @returns A new, independently-owned Archive for the nested MPQ
   */
  openFileArchive(fileName: string, options?: FileArchiveOpenOptions): Archive {
    const nested = invoke(() =>
      this.archive.SFileOpenFileArchive(fileName, options?.priority || 0, options?.flags || 0),
    )
    return new Archive(nested)
  }

  /**
   * Open a nested MPQ archive on a worker thread (does not block the event loop).
   * @param fileName - Name of the nested archive file within this archive
   * @param options - Optional priority and open flags
   * @returns A new, independently-owned Archive for the nested MPQ
   */
  async openFileArchiveAsync(fileName: string, options?: FileArchiveOpenOptions): Promise<Archive> {
    const nested = await invokeAsync(
      this.archive.openFileArchiveAsync(fileName, options?.priority || 0, options?.flags || 0),
    )
    return new Archive(nested)
  }

  /**
   * Check if a file exists in the archive
   * @param filename - Name of the file
   * @returns true if file exists, false otherwise
   */
  hasFile(filename: string): boolean {
    return invoke(() => this.archive.SFileHasFile(filename))
  }

  /**
   * Alias for hasFile — symmetry with casclib's Storage.fileExists().
   */
  fileExists(filename: string): boolean {
    return this.hasFile(filename)
  }

  /**
   * Extract a file from the archive to disk
   * @param source - Source filename in archive
   * @param destination - Destination path on disk
   * @returns true if successful
   */
  extractFile(source: string, destination: string): boolean {
    return invoke(() => this.archive.SFileExtractFile(source, destination))
  }

  /**
   * Extract a file from the archive to disk on a worker thread
   * (does not block the event loop).
   * @param source - Source filename in archive
   * @param destination - Destination path on disk
   * @returns true if successful
   */
  extractFileAsync(source: string, destination: string): Promise<boolean> {
    return invokeAsync(this.archive.extractFileAsync(source, destination))
  }

  /**
   * Add a file to the archive with default compression
   * @param sourcePath - Path to the file on disk
   * @param archiveName - Name for the file in the archive
   * @param options - Optional add file options
   * @returns true if successful
   */
  addFile(sourcePath: string, archiveName: string, options?: AddFileOptions): boolean {
    if (options?.compression !== undefined || options?.compressionNext !== undefined) {
      return invoke(() =>
        this.archive.SFileAddFileEx(
          sourcePath,
          archiveName,
          options.flags || 0,
          options.compression || 0,
          options.compressionNext || 0,
        ),
      )
    }
    return invoke(() => this.archive.SFileAddFile(sourcePath, archiveName, options?.flags))
  }

  /**
   * Add a file to the archive with explicit compression settings
   * @param sourcePath - Path to the file on disk
   * @param archiveName - Name for the file in the archive
   * @param flags - File flags (compression, encryption, etc.)
   * @param compression - Compression method for first sector
   * @param compressionNext - Compression method for subsequent sectors
   * @returns true if successful
   */
  addFileEx(
    sourcePath: string,
    archiveName: string,
    flags: number,
    compression: number,
    compressionNext: number,
  ): boolean {
    return invoke(() =>
      this.archive.SFileAddFileEx(sourcePath, archiveName, flags, compression, compressionNext),
    )
  }

  /**
   * Remove a file from the archive
   * @param filename - Name of the file to remove
   * @returns true if successful
   */
  removeFile(filename: string): boolean {
    return invoke(() => this.archive.SFileRemoveFile(filename))
  }

  /**
   * Rename a file in the archive
   * @param oldName - Current filename
   * @param newName - New filename
   * @returns true if successful
   */
  renameFile(oldName: string, newName: string): boolean {
    return invoke(() => this.archive.SFileRenameFile(oldName, newName))
  }

  /**
   * Create a new file in the archive for writing
   * @param filename - Name of the file to create
   * @param fileTime - File timestamp
   * @param fileSize - Size of the file
   * @param locale - Locale ID (default: 0)
   * @param flags - File flags (default: compressed and encrypted)
   * @returns File object for writing
   */
  createFile(
    filename: string,
    fileTime: number,
    fileSize: number,
    locale: number = 0,
    flags?: number,
  ): File {
    const file = invoke(() =>
      this.archive.SFileCreateFile(filename, fileTime, fileSize, locale, flags || 0),
    )
    return new File(file)
  }

  /**
   * Add a wave file to the archive with compression
   * @param sourcePath - Path to the wave file on disk
   * @param archiveName - Name for the file in the archive
   * @param flags - File flags (default: compressed and encrypted)
   * @param quality - Compression quality (default: 1)
   * @returns true if successful
   */
  addWave(sourcePath: string, archiveName: string, flags?: number, quality: number = 1): boolean {
    return invoke(() => this.archive.SFileAddWave(sourcePath, archiveName, flags || 0, quality))
  }

  // ---------------------------------------------------------------------------
  // Archive info / attributes
  // ---------------------------------------------------------------------------

  /**
   * Get the maximum number of files the archive can contain
   * @returns Maximum file count
   */
  getMaxFileCount(): number {
    return invoke(() => this.archive.SFileGetMaxFileCount())
  }

  /**
   * Set the maximum number of files the archive can contain
   * @param maxFileCount - New maximum file count
   * @returns true if successful
   */
  setMaxFileCount(maxFileCount: number): boolean {
    return invoke(() => this.archive.SFileSetMaxFileCount(maxFileCount))
  }

  /**
   * Get the attributes flags for the archive
   * @returns Attributes flags
   */
  getAttributes(): number {
    return invoke(() => this.archive.SFileGetAttributes())
  }

  /**
   * Set the attributes flags for the archive
   * @param attributes - Attributes flags to set
   * @returns true if successful
   */
  setAttributes(attributes: number): boolean {
    return invoke(() => this.archive.SFileSetAttributes(attributes))
  }

  /**
   * Update attributes for a specific file
   * @param filename - Name of the file
   * @returns true if successful
   */
  updateFileAttributes(filename: string): boolean {
    return invoke(() => this.archive.SFileUpdateFileAttributes(filename))
  }

  /**
   * Get archive/file information
   * @param infoClass - Information class to retrieve
   * @returns Buffer containing the info data or null
   */
  getFileInfo(infoClass: number): Buffer | null {
    return invoke(() => this.archive.SFileGetFileInfo(infoClass))
  }

  // ---------------------------------------------------------------------------
  // Verification / signing
  // ---------------------------------------------------------------------------

  /**
   * Verify a file in the archive
   * @param filename - Name of the file to verify
   * @param flags - Verification flags (SFILE_VERIFY_*)
   * @returns Verification result flags
   */
  verifyFile(filename: string, flags: number): number {
    return invoke(() => this.archive.SFileVerifyFile(filename, flags))
  }

  /**
   * Verify the archive signature
   * @returns Verification result code (ERROR_NO_SIGNATURE, ERROR_WEAK_SIGNATURE_OK, etc.)
   */
  verifyArchive(): number {
    return invoke(() => this.archive.SFileVerifyArchive())
  }

  /**
   * Sign the archive with a digital signature
   * @param signatureType - Type of signature to apply
   * @returns true if successful
   */
  signArchive(signatureType: number = 0): boolean {
    return invoke(() => this.archive.SFileSignArchive(signatureType))
  }

  /**
   * Get checksums (CRC32 and MD5) for a file
   * @param filename - Name of the file
   * @returns Object containing crc32 and md5
   */
  getFileChecksums(filename: string): { crc32: number; md5: string } {
    return invoke(() => this.archive.SFileGetFileChecksums(filename))
  }

  // ---------------------------------------------------------------------------
  // Listfiles / patches / locales
  // ---------------------------------------------------------------------------

  /**
   * Add a listfile to the archive
   * @param listfilePath - Path to the listfile
   * @returns Number of entries added
   */
  addListFile(listfilePath: string): number {
    return invoke(() => this.archive.SFileAddListFile(listfilePath))
  }

  /**
   * Open a patch archive
   * @param patchPath - Path to the patch archive
   * @param patchPrefix - Optional patch path prefix
   * @param flags - Optional flags
   * @returns true if successful
   */
  openPatchArchive(patchPath: string, patchPrefix?: string, flags: number = 0): boolean {
    return invoke(() => this.archive.SFileOpenPatchArchive(patchPath, patchPrefix || null, flags))
  }

  /**
   * Check if the archive has patches applied
   * @returns true if patched
   */
  isPatchedArchive(): boolean {
    return invoke(() => this.archive.SFileIsPatchedArchive())
  }

  /**
   * Enumerate available locales for a file
   * @param filename - Name of the file
   * @param searchScope - Search scope (default: 0)
   * @returns Array of locale IDs
   */
  enumLocales(filename: string, searchScope: number = 0): number[] {
    return invoke(() => this.archive.SFileEnumLocales(filename, searchScope))
  }

  // ---------------------------------------------------------------------------
  // File enumeration
  // ---------------------------------------------------------------------------

  /**
   * Find all files matching a mask
   * @param mask - File mask (wildcards supported), default is "*"
   * @returns Array of file information or null if no files found
   */
  findFiles(mask: string = '*'): FileInfo[] | null {
    return invoke(() => this.archive.SFileFindFirstFile(mask))
  }

  /**
   * List all files in the archive
   * @returns Array of file information
   */
  listFiles(): FileInfo[] {
    return this.findFiles('*') || []
  }

  /**
   * Lazily iterate files matching a mask.
   *
   * @example
   * ```typescript
   * for (const entry of archive.files('*.txt')) {
   *   console.log(entry.name, entry.fileSize);
   * }
   * ```
   */
  *files(mask: string = '*'): IterableIterator<FileInfo> {
    yield* this.findFiles(mask) || []
  }

  /**
   * Iterating an Archive yields every file in it (mask "*").
   */
  [Symbol.iterator](): IterableIterator<FileInfo> {
    return this.files()
  }

  /**
   * Get all file names in the archive
   * @param mask - File mask to filter (default: "*")
   * @returns Array of file names
   */
  getFileNames(mask: string = '*'): string[] {
    const files = this.findFiles(mask)
    return files ? files.map((f) => f.name) : []
  }

  /**
   * Find all files whose name matches a regular expression.
   * Enumerates the whole archive and filters client-side — for simple
   * wildcard patterns, prefer findFiles(mask), which filters natively.
   *
   * @example
   * ```typescript
   * const scripts = archive.findFilesMatching(/\.xml$/i);
   * console.log(`Found ${scripts.length} files`);
   * ```
   */
  findFilesMatching(pattern: RegExp): FileInfo[] {
    return (this.findFiles('*') || []).filter((f) => pattern.test(f.name))
  }

  // ---------------------------------------------------------------------------
  // High-level helpers
  // ---------------------------------------------------------------------------

  /**
   * Read a file from the archive and return it as a Buffer.
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
   * Read a file from the archive on a worker thread (does not block the
   * event loop). Opens and closes the file internally.
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
   * Read a file from archive as a string
   * @param filename - Name of the file to read
   * @param encoding - Text encoding (default: 'utf-8')
   * @returns The file content as string
   */
  readFileAsString(filename: string, encoding: BufferEncoding = 'utf-8'): string {
    return this.readFile(filename).toString(encoding)
  }

  /**
   * Read a file from archive and parse as JSON
   * @param filename - Name of the JSON file
   * @returns Parsed JSON object
   */
  // Preserve the untyped JSON convenience API; callers may supply an explicit result type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readFileAsJson<T = any>(filename: string): T {
    return JSON.parse(this.readFileAsString(filename, 'utf-8')) as T
  }

  /**
   * Read a file from the archive as a string on a worker thread
   * (does not block the event loop).
   * @param filename - Name of the file to read
   * @param encoding - Text encoding (default: 'utf-8')
   * @returns The file content as string
   */
  async readFileAsStringAsync(
    filename: string,
    encoding: BufferEncoding = 'utf-8',
  ): Promise<string> {
    return (await this.readFileAsync(filename)).toString(encoding)
  }

  /**
   * Add in-memory data to the archive as a file. Wraps the
   * createFile → write → finish sequence so no temp file on disk is needed.
   * @param archiveName - Name for the file in the archive
   * @param data - File contents
   * @param options - Optional flags, compression, fileTime and locale
   * @returns true if successful
   *
   * @example
   * ```typescript
   * archive.addBuffer('data/blob.bin', Buffer.from([1, 2, 3]));
   * ```
   */
  addBuffer(archiveName: string, data: Buffer, options?: AddBufferOptions): boolean {
    const flags = options?.flags ?? MPQ_FILE_COMPRESS | MPQ_FILE_REPLACEEXISTING
    const file = this.createFile(
      archiveName,
      options?.fileTime ?? 0,
      data.length,
      options?.locale ?? 0,
      flags,
    )
    try {
      if (data.length > 0) {
        file.write(data, options?.compression ?? MPQ_COMPRESSION_ZLIB)
      }
      return file.finish()
    } catch (err) {
      try {
        file.close()
      } catch {
        /* finish/close best effort on failure */
      }
      throw err
    }
  }

  /**
   * Add a string to the archive as a file.
   * @param archiveName - Name for the file in the archive
   * @param text - File contents
   * @param options - Optional add options; `encoding` defaults to 'utf-8'
   * @returns true if successful
   */
  addString(
    archiveName: string,
    text: string,
    options?: AddBufferOptions & { encoding?: BufferEncoding },
  ): boolean {
    return this.addBuffer(archiveName, Buffer.from(text, options?.encoding ?? 'utf-8'), options)
  }

  /**
   * Extract every file matching an MPQ mask (string) or regular expression
   * to a directory, preserving the archive's directory structure.
   * Files that cannot be extracted are skipped and reported in `failed`.
   *
   * @param outputDir - Output directory (subdirectories are created as needed)
   * @param pattern - Mask like `"*.txt"` or a RegExp tested against the file name (default: all files)
   * @returns The file names that were extracted and the ones that failed
   *
   * @example
   * ```typescript
   * const { extracted, failed } = archive.extractFiles('./out', /\.xml$/i);
   * console.log(`Extracted ${extracted.length} files (${failed.length} failed)`);
   * ```
   */
  extractFiles(
    outputDir: string,
    pattern: string | RegExp = '*',
  ): { extracted: string[]; failed: string[] } {
    const entries =
      typeof pattern === 'string' ? this.findFiles(pattern) || [] : this.findFilesMatching(pattern)
    const extracted: string[] = []
    const failed: string[] = []
    for (const fileInfo of entries) {
      const destination = Archive.safeDestination(outputDir, fileInfo.name)
      if (!destination) {
        failed.push(fileInfo.name)
        continue
      }
      try {
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        this.extractFile(fileInfo.name, destination)
        extracted.push(fileInfo.name)
      } catch {
        failed.push(fileInfo.name)
      }
    }
    return { extracted, failed }
  }

  /**
   * Like extractFiles, but reads and writes on a worker thread without
   * blocking the event loop. Files are extracted sequentially —
   * MPQ handles must not run concurrent operations.
   */
  async extractFilesAsync(
    outputDir: string,
    pattern: string | RegExp = '*',
  ): Promise<{ extracted: string[]; failed: string[] }> {
    const entries =
      typeof pattern === 'string' ? this.findFiles(pattern) || [] : this.findFilesMatching(pattern)
    const extracted: string[] = []
    const failed: string[] = []
    for (const fileInfo of entries) {
      const destination = Archive.safeDestination(outputDir, fileInfo.name)
      if (!destination) {
        failed.push(fileInfo.name)
        continue
      }
      try {
        await fs.promises.mkdir(path.dirname(destination), { recursive: true })
        await this.extractFileAsync(fileInfo.name, destination)
        extracted.push(fileInfo.name)
      } catch {
        failed.push(fileInfo.name)
      }
    }
    return { extracted, failed }
  }

  /**
   * Map an archive file name to a destination path inside outputDir,
   * or null if the name would escape it. Archive names come from MPQ
   * metadata and are untrusted: reject `..` segments and drive letters,
   * then verify the resolved path stays under the output root (zip-slip
   * guard).
   */
  private static safeDestination(outputDir: string, fileName: string): string | null {
    const parts = fileName.split(/[\\/]+/).filter((p) => p && p !== '.')
    if (parts.length === 0 || parts.some((p) => p === '..' || /^[a-zA-Z]:$/.test(p))) return null
    const destination = path.resolve(outputDir, ...parts)
    const root = path.resolve(outputDir) + path.sep
    if (!destination.startsWith(root)) return null
    return destination
  }

  /**
   * Get the number of files in the archive matching a mask
   * @param mask - File mask to filter (default: "*")
   * @returns Number of matching files
   */
  getFileCount(mask: string = '*'): number {
    return this.findFiles(mask)?.length ?? 0
  }

  /**
   * Check if a file exists and can be opened
   * @param filename - Name of the file
   * @returns true if file exists and is accessible
   */
  canOpenFile(filename: string): boolean {
    try {
      return this.hasFile(filename)
    } catch {
      return false
    }
  }

  /**
   * Get the total size of all files in the archive
   * @returns Total size in bytes
   */
  getTotalSize(): number {
    const files = this.findFiles('*')
    if (!files) return 0
    return files.reduce((total, file) => total + file.fileSize, 0)
  }

  /**
   * Get the total compressed size of all files
   * @returns Total compressed size in bytes
   */
  getTotalCompressedSize(): number {
    const files = this.findFiles('*')
    if (!files) return 0
    return files.reduce((total, file) => total + file.compSize, 0)
  }

  /**
   * Get compression ratio for the archive
   * @returns Compression ratio (0.0 to 1.0, where 0.5 means 50% compressed)
   */
  getCompressionRatio(): number {
    const totalSize = this.getTotalSize()
    if (totalSize === 0) return 0
    const compressedSize = this.getTotalCompressedSize()
    return compressedSize / totalSize
  }

  /**
   * Symbol.dispose support for `using` blocks (TS 5.2+).
   */
  [kDispose](): void {
    this.close()
  }
}

/**
 * Open an archive, run a callback, and guarantee close() — even on throw.
 * Mirrors casclib's withStorage().
 *
 * @example
 *   const text = withArchive(a => {
 *     a.open('/path/to/foo.mpq');
 *     return a.readFileAsString('readme.txt');
 *   });
 */
export function withArchive<T>(fn: (archive: Archive) => T): T {
  const archive = new Archive()
  try {
    return fn(archive)
  } finally {
    try {
      archive.close()
    } catch {
      /* already closed */
    }
  }
}

/**
 * Async variant of {@link withArchive} — awaits the callback before closing.
 *
 * @example
 *   const text = await withArchiveAsync(async a => {
 *     await a.openAsync('/path/to/foo.mpq');
 *     return (await a.readFileAsync('readme.txt')).toString();
 *   });
 */
export async function withArchiveAsync<T>(fn: (archive: Archive) => Promise<T>): Promise<T> {
  const archive = new Archive()
  try {
    return await fn(archive)
  } finally {
    try {
      archive.close()
    } catch {
      /* already closed */
    }
  }
}
