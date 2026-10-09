import { MPQFile } from './bindings.js'
import { invoke, invokeAsync } from './errors.js'
import { kDispose } from './dispose.js'
import { Archive } from './archive.js'

/**
 * StormLib File wrapper class
 * Represents an open file in an MPQ archive.
 *
 * Files are obtained from `Archive.openFile()` / `Archive.createFile()`.
 * Always `close()` (or `finish()` for written files) when done.
 */
export class File {
  private file: MPQFile

  /** @internal — use `Archive.openFile()` / `Archive.createFile()` */
  constructor(file: MPQFile) {
    this.file = file
  }

  /**
   * Read data from the file at the current position
   * @param bytesToRead - Number of bytes to read (default: 4096)
   * @returns Buffer containing the read data
   */
  read(bytesToRead?: number): Buffer {
    return invoke(() => this.file.SFileReadFile(bytesToRead ?? 4096))
  }

  /**
   * Read remaining data from the current cursor (up to 256 MiB).
   * @returns Buffer containing the remaining file data
   */
  readAll(): Buffer {
    return invoke(() => this.file.readFileAll())
  }

  /**
   * Read all data from the file without blocking the event loop.
   * The read (and decompression) runs on a libuv worker thread.
   *
   * Do not perform other operations on this file while the read is pending.
   */
  readAllAsync(): Promise<Buffer> {
    return invokeAsync(this.file.readAllAsync())
  }

  /**
   * Get the file size
   * @returns File size in bytes
   */
  getSize(): number {
    return invoke(() => this.file.SFileGetFileSize())
  }

  /**
   * Get the current file position
   * @returns Current position in bytes
   */
  getPosition(): number {
    return invoke(() => this.file.SFileGetFilePointer())
  }

  /**
   * Set the file position
   * @param position - New position in bytes
   * @returns The new position
   */
  setPosition(position: number): number {
    return invoke(() => this.file.SFileSetFilePointer(position))
  }

  /**
   * Close the file
   * @returns true if closed successfully
   */
  close(): boolean {
    return this.file.SFileCloseFile()
  }

  /**
   * Write data to the file
   * @param data - Buffer containing data to write
   * @param compression - Compression method (default: ZLIB)
   * @returns true if successful
   */
  write(data: Buffer, compression?: number): boolean {
    return invoke(() => this.file.SFileWriteFile(data, compression || 0x02)) // MPQ_COMPRESSION_ZLIB
  }

  /**
   * Finish writing to the file and close it
   * @returns true if successful
   */
  finish(): boolean {
    return invoke(() => this.file.SFileFinishFile())
  }

  /**
   * Get the filename
   * @returns The filename
   */
  getFileName(): string {
    return invoke(() => this.file.SFileGetFileName())
  }

  /**
   * Set the locale for the file
   * @param locale - Locale ID to set
   * @returns true if successful
   */
  setLocale(locale: number): boolean {
    return invoke(() => this.file.SFileSetFileLocale(locale))
  }

  /**
   * Get file information
   * @param infoClass - Information class to retrieve
   * @returns Buffer containing the info data or null
   */
  getFileInfo(infoClass: number): Buffer | null {
    return invoke(() => this.file.SFileGetFileInfo(infoClass))
  }

  /**
   * Get the archive that owns this open file.
   *
   * The returned Archive is a *borrowed* reference: it shares the
   * underlying handle with whichever archive originally served this file
   * (the archive it was opened from, or a patch archive in its chain).
   * Its `close()` is a safe no-op — the handle stays owned by the
   * original opener and is unaffected either way.
   */
  getArchive(): Archive {
    const archive = invoke(() => this.file.SFileGetFileArchive())
    return new Archive(archive)
  }

  /**
   * Symbol.dispose support for `using` blocks (TS 5.2+).
   */
  [kDispose](): void {
    this.close()
  }
}
