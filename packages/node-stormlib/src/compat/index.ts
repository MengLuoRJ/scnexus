/**
 * @jamiephan/stormlib — Node.js native bindings for StormLib.
 *
 * Two API layers are exported:
 *  - High-level: `Archive` / `File` classes with camelCase methods,
 *    Promise-based async variants, iterators, and structured `StormError`s.
 *  - Low-level: raw native bindings in `./bindings` using exact upstream
 *    C function names (`SFileOpenArchive`, `SFileReadFile`, ...).
 */

// High-level API
export { Archive, withArchive, withArchiveAsync } from './archive.js'
export type {
  ArchiveOpenOptions,
  ArchiveCreateOptions,
  FileOpenOptions,
  AddFileOptions,
  AddBufferOptions,
} from './archive.js'
export { File } from './file.js'
export { StormError, StormErrorCode } from './errors.js'

// Low-level bindings (types, raw classes, utility functions)
export * from './bindings.js'

// Constants (MPQ flags, locales, compression methods, ...)
export * from './constants.js'

// Default export
import { Archive, withArchive, withArchiveAsync } from './archive.js'
import { File } from './file.js'
import { StormError } from './errors.js'

export default {
  Archive,
  File,
  StormError,
  withArchive,
  withArchiveAsync,
}
