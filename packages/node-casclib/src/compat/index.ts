/**
 * @jamiephan/casclib — Node.js native bindings for CascLib.
 *
 * Two API layers are exported:
 *  - High-level: `Storage` / `File` classes with camelCase methods,
 *    Promise-based async variants, iterators, and structured `CascError`s.
 *  - Low-level: raw native bindings in `./bindings` using exact upstream
 *    C function names (`CascOpenStorage`, `CascGetFileSize64`, ...).
 */

// High-level API
export { Storage, withStorage, withStorageAsync } from './storage.js'
export type { StorageOpenOptions, FileInfo, FileOpenOptions } from './storage.js'
export { File } from './file.js'
export { CascError, CascErrorCode } from './errors.js'

// Low-level bindings (types, raw classes, utility functions)
export * from './bindings.js'

// Constants (re-exported from the native addon)
export * from './constants.js'

// Default export
import { Storage, withStorage, withStorageAsync } from './storage.js'
import { File } from './file.js'
import { CascError } from './errors.js'

export default {
  Storage,
  File,
  CascError,
  withStorage,
  withStorageAsync,
}
