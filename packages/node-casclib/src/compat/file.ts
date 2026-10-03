import { CascFile, CascFileInfoResult } from './bindings.js';
import { invoke, invokeAsync } from './errors.js';
import { kDispose } from './dispose.js';

/**
 * CascLib File wrapper class
 * Represents an open file in CASC storage.
 *
 * Files are obtained from `Storage.openFile()`. Always `close()` the file
 * when done (or use a `using` block / `withStorage`-style helper).
 */
export class File {
  private file: CascFile;

  /** @internal — use `Storage.openFile()` */
  constructor(file: CascFile) {
    this.file = file;
  }

  /**
   * Read data from the file at the current position
   * @param bytesToRead - Number of bytes to read (default: 4096)
   * @returns Buffer containing the read data
   */
  read(bytesToRead?: number): Buffer {
    return invoke(() => this.file.CascReadFile(bytesToRead || 4096));
  }

  /**
   * Read all data from the file
   * @returns Buffer containing all file data
   */
  readAll(): Buffer {
    return invoke(() => this.file.readFileAll());
  }

  /**
   * Read all data from the file without blocking the event loop.
   * The read runs on a libuv worker thread — for online storages this can
   * include CDN downloads, so prefer this over `readAll()` in servers.
   *
   * Do not perform other operations on this file while the read is pending.
   */
  readAllAsync(): Promise<Buffer> {
    return invokeAsync(this.file.readAllAsync());
  }

  /**
   * Get the file size (32-bit)
   * @returns File size in bytes
   */
  getSize(): number {
    return invoke(() => this.file.CascGetFileSize());
  }

  /**
   * Get the file size (64-bit)
   * @returns File size in bytes
   */
  getSize64(): number {
    return invoke(() => this.file.CascGetFileSize64());
  }

  /**
   * Get the current file position (32-bit)
   * @returns Current position in bytes
   */
  getPosition(): number {
    return invoke(() => this.file.CascGetFilePointer());
  }

  /**
   * Get the current file position (64-bit)
   * @returns Current position in bytes
   */
  getPosition64(): number {
    return invoke(() => this.file.CascGetFilePointer64());
  }

  /**
   * Set the file position (32-bit)
   * @param position - New position in bytes
   * @returns The new position
   */
  setPosition(position: number): number {
    return invoke(() => this.file.CascSetFilePointer(position));
  }

  /**
   * Set the file position (64-bit)
   * @param position - New position in bytes
   * @param moveMethod - Move method (FILE_BEGIN, FILE_CURRENT, FILE_END)
   * @returns The new position
   */
  setPosition64(position: number, moveMethod?: number): number {
    return invoke(() => this.file.CascSetFilePointer64(position, moveMethod));
  }

  /**
   * Get detailed file information
   * @param infoClass - The type of information to retrieve
   * @returns File information object
   */
  getFileInfo(infoClass: number): CascFileInfoResult {
    return invoke(() => this.file.CascGetFileInfo(infoClass));
  }

  /**
   * Set file flags
   * @param flags - Flags to set
   * @returns true if set successfully
   */
  setFileFlags(flags: number): boolean {
    return invoke(() => this.file.CascSetFileFlags(flags));
  }

  /**
   * Close the file
   * @returns true if closed successfully
   */
  close(): boolean {
    return this.file.CascCloseFile();
  }

  /**
   * Symbol.dispose support for `using` blocks (TS 5.2+).
   */
  [kDispose](): void {
    this.close();
  }
}
