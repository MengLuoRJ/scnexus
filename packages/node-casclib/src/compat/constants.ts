/**
 * CascLib constants re-exported from the native addon so values always match
 * the compiled upstream headers.
 */
import { native } from './bindings.js'

// Version constants
export const CASCLIB_VERSION: number = native.CASCLIB_VERSION || 0x0300
export const CASCLIB_VERSION_STRING: string = '3.0'

// File positioning constants
export const FILE_BEGIN: number = native.FILE_BEGIN
export const FILE_CURRENT: number = native.FILE_CURRENT
export const FILE_END: number = native.FILE_END

// Other useful constants
export const CASC_FILEID_FORMAT: string = native.CASC_FILEID_FORMAT
export const CASC_PARAM_SEPARATOR: string = native.CASC_PARAM_SEPARATOR

// Progress message constants
export const CascProgressLoadingFile: number = native.CascProgressLoadingFile
export const CascProgressLoadingManifest: number = native.CascProgressLoadingManifest
export const CascProgressDownloadingFile: number = native.CascProgressDownloadingFile
export const CascProgressLoadingIndexes: number = native.CascProgressLoadingIndexes
export const CascProgressDownloadingArchiveIndexes: number =
  native.CascProgressDownloadingArchiveIndexes

// Open flags
export const CASC_OPEN_BY_NAME: number = native.CASC_OPEN_BY_NAME
export const CASC_OPEN_BY_CKEY: number = native.CASC_OPEN_BY_CKEY
export const CASC_OPEN_BY_EKEY: number = native.CASC_OPEN_BY_EKEY
export const CASC_OPEN_BY_FILEID: number = native.CASC_OPEN_BY_FILEID
export const CASC_OPEN_TYPE_MASK: number = native.CASC_OPEN_TYPE_MASK
export const CASC_OPEN_FLAGS_MASK: number = native.CASC_OPEN_FLAGS_MASK
export const CASC_STRICT_DATA_CHECK: number = native.CASC_STRICT_DATA_CHECK
export const CASC_OVERCOME_ENCRYPTED: number = native.CASC_OVERCOME_ENCRYPTED
export const CASC_OPEN_CKEY_ONCE: number = native.CASC_OPEN_CKEY_ONCE

// Locale flags
export const CASC_LOCALE_ALL: number = native.CASC_LOCALE_ALL
export const CASC_LOCALE_ALL_WOW: number = native.CASC_LOCALE_ALL_WOW
export const CASC_LOCALE_NONE: number = native.CASC_LOCALE_NONE
export const CASC_LOCALE_UNKNOWN1: number = native.CASC_LOCALE_UNKNOWN1
export const CASC_LOCALE_ENUS: number = native.CASC_LOCALE_ENUS
export const CASC_LOCALE_KOKR: number = native.CASC_LOCALE_KOKR
export const CASC_LOCALE_RESERVED: number = native.CASC_LOCALE_RESERVED
export const CASC_LOCALE_FRFR: number = native.CASC_LOCALE_FRFR
export const CASC_LOCALE_DEDE: number = native.CASC_LOCALE_DEDE
export const CASC_LOCALE_ZHCN: number = native.CASC_LOCALE_ZHCN
export const CASC_LOCALE_ESES: number = native.CASC_LOCALE_ESES
export const CASC_LOCALE_ZHTW: number = native.CASC_LOCALE_ZHTW
export const CASC_LOCALE_ENGB: number = native.CASC_LOCALE_ENGB
export const CASC_LOCALE_ENCN: number = native.CASC_LOCALE_ENCN
export const CASC_LOCALE_ENTW: number = native.CASC_LOCALE_ENTW
export const CASC_LOCALE_ESMX: number = native.CASC_LOCALE_ESMX
export const CASC_LOCALE_RURU: number = native.CASC_LOCALE_RURU
export const CASC_LOCALE_PTBR: number = native.CASC_LOCALE_PTBR
export const CASC_LOCALE_ITIT: number = native.CASC_LOCALE_ITIT
export const CASC_LOCALE_PTPT: number = native.CASC_LOCALE_PTPT

// Content flags
export const CASC_CFLAG_INSTALL: number = native.CASC_CFLAG_INSTALL
export const CASC_CFLAG_LOAD_ON_WINDOWS: number = native.CASC_CFLAG_LOAD_ON_WINDOWS
export const CASC_CFLAG_LOAD_ON_MAC: number = native.CASC_CFLAG_LOAD_ON_MAC
export const CASC_CFLAG_X86_32: number = native.CASC_CFLAG_X86_32
export const CASC_CFLAG_X86_64: number = native.CASC_CFLAG_X86_64
export const CASC_CFLAG_LOW_VIOLENCE: number = native.CASC_CFLAG_LOW_VIOLENCE
export const CASC_CFLAG_DONT_LOAD: number = native.CASC_CFLAG_DONT_LOAD
export const CASC_CFLAG_UPDATE_PLUGIN: number = native.CASC_CFLAG_UPDATE_PLUGIN
export const CASC_CFLAG_ARM64: number = native.CASC_CFLAG_ARM64
export const CASC_CFLAG_ENCRYPTED: number = native.CASC_CFLAG_ENCRYPTED
export const CASC_CFLAG_NO_NAME_HASH: number = native.CASC_CFLAG_NO_NAME_HASH
export const CASC_CFLAG_UNCMN_RESOLUTION: number = native.CASC_CFLAG_UNCMN_RESOLUTION
export const CASC_CFLAG_BUNDLE: number = native.CASC_CFLAG_BUNDLE
export const CASC_CFLAG_NO_COMPRESSION: number = native.CASC_CFLAG_NO_COMPRESSION

// Hash sizes
export const MD5_HASH_SIZE: number = native.MD5_HASH_SIZE
export const MD5_STRING_SIZE: number = native.MD5_STRING_SIZE
export const SHA1_HASH_SIZE: number = native.SHA1_HASH_SIZE
export const SHA1_STRING_SIZE: number = native.SHA1_STRING_SIZE

// Invalid values
export const CASC_INVALID_INDEX: number = native.CASC_INVALID_INDEX
export const CASC_INVALID_SIZE: number = native.CASC_INVALID_SIZE
export const CASC_INVALID_POS: number = native.CASC_INVALID_POS
export const CASC_INVALID_ID: number = native.CASC_INVALID_ID
export const CASC_INVALID_OFFS64: number = native.CASC_INVALID_OFFS64
export const CASC_INVALID_SIZE64: number = native.CASC_INVALID_SIZE64

// Storage info constants
export const CascStorageLocalFileCount: number = native.CascStorageLocalFileCount
export const CascStorageTotalFileCount: number = native.CascStorageTotalFileCount
export const CascStorageFeatures: number = native.CascStorageFeatures
export const CascStorageInstalledLocales: number = native.CascStorageInstalledLocales
export const CascStorageProduct: number = native.CascStorageProduct
export const CascStorageTags: number = native.CascStorageTags
export const CascStoragePathProduct: number = native.CascStoragePathProduct

// File info constants
export const CascFileContentKey: number = native.CascFileContentKey
export const CascFileEncodedKey: number = native.CascFileEncodedKey
export const CascFileFullInfo: number = native.CascFileFullInfo
export const CascFileSpanInfo: number = native.CascFileSpanInfo

// Feature flags
export const CASC_FEATURE_FILE_NAMES: number = native.CASC_FEATURE_FILE_NAMES
export const CASC_FEATURE_ROOT_CKEY: number = native.CASC_FEATURE_ROOT_CKEY
export const CASC_FEATURE_TAGS: number = native.CASC_FEATURE_TAGS
export const CASC_FEATURE_FNAME_HASHES: number = native.CASC_FEATURE_FNAME_HASHES
export const CASC_FEATURE_FNAME_HASHES_OPTIONAL: number = native.CASC_FEATURE_FNAME_HASHES_OPTIONAL
export const CASC_FEATURE_FILE_DATA_IDS: number = native.CASC_FEATURE_FILE_DATA_IDS
export const CASC_FEATURE_LOCALE_FLAGS: number = native.CASC_FEATURE_LOCALE_FLAGS
export const CASC_FEATURE_CONTENT_FLAGS: number = native.CASC_FEATURE_CONTENT_FLAGS
export const CASC_FEATURE_DATA_ARCHIVES: number = native.CASC_FEATURE_DATA_ARCHIVES
export const CASC_FEATURE_DATA_FILES: number = native.CASC_FEATURE_DATA_FILES
export const CASC_FEATURE_ONLINE: number = native.CASC_FEATURE_ONLINE
export const CASC_FEATURE_FORCE_DOWNLOAD: number = native.CASC_FEATURE_FORCE_DOWNLOAD
export const CASC_FEATURE_ALLOW_DOWNLOAD: number = native.CASC_FEATURE_ALLOW_DOWNLOAD

// Key length
export const CASC_KEY_LENGTH: number = native.CASC_KEY_LENGTH
