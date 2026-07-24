/**
 * StormLib Constants
 * These constants match the original StormLib API
 */

// StormLib Version
export const STORMLIB_VERSION = 0x0928;
export const STORMLIB_VERSION_STRING = '9.40';

// Archive IDs
export const ID_MPQ = 0x1A51504D;
export const ID_MPQ_USERDATA = 0x1B51504D;
export const ID_MPQ_FILE_SIGNATURE = 0x5349474E;

// Error codes
export const ERROR_AVI_FILE = 10000;
export const ERROR_UNKNOWN_FILE_KEY = 10001;
export const ERROR_CHECKSUM_ERROR = 10002;
export const ERROR_INTERNAL_FILE = 10003;
export const ERROR_BASE_FILE_MISSING = 10004;
export const ERROR_MARKED_FOR_DELETE = 10005;
export const ERROR_FILE_INCOMPLETE = 10006;
export const ERROR_UNKNOWN_FILE_NAMES = 10007;
export const ERROR_CANT_FIND_PATCH_PREFIX = 10008;
export const ERROR_FAKE_MPQ_HEADER = 10009;
export const ERROR_FILE_DELETED = 10010;

// Hash table sizes
export const HASH_TABLE_SIZE_MIN = 0x00000004;
export const HASH_TABLE_SIZE_DEFAULT = 0x00001000;
export const HASH_TABLE_SIZE_MAX = 0x00080000;

// Hash entry markers
export const HASH_ENTRY_DELETED = 0xFFFFFFFE;
export const HASH_ENTRY_FREE = 0xFFFFFFFF;

// HET entry markers
export const HET_ENTRY_DELETED = 0x80;
export const HET_ENTRY_FREE = 0x00;

// Open archive flags
export const SFILE_OPEN_HARD_DISK_FILE = 2;
export const SFILE_OPEN_CDROM_FILE = 3;

// Open file flags
export const SFILE_OPEN_FROM_MPQ = 0x00000000;
export const SFILE_OPEN_CHECK_EXISTS = 0xFFFFFFFC;
export const SFILE_OPEN_BASE_FILE = 0xFFFFFFFD;
export const SFILE_OPEN_ANY_LOCALE = 0xFFFFFFFE;
export const SFILE_OPEN_LOCAL_FILE = 0xFFFFFFFF;

// Invalid return values
export const SFILE_INVALID_SIZE = 0xFFFFFFFF;
export const SFILE_INVALID_POS = 0xFFFFFFFF;
export const SFILE_INVALID_ATTRIBUTES = 0xFFFFFFFF;

// File flags
export const MPQ_FILE_IMPLODE = 0x00000100;
export const MPQ_FILE_COMPRESS = 0x00000200;
export const MPQ_FILE_ENCRYPTED = 0x00010000;
export const MPQ_FILE_FIX_KEY = 0x00020000;
export const MPQ_FILE_PATCH_FILE = 0x00100000;
export const MPQ_FILE_SINGLE_UNIT = 0x01000000;
export const MPQ_FILE_DELETE_MARKER = 0x02000000;
export const MPQ_FILE_SECTOR_CRC = 0x04000000;
export const MPQ_FILE_SIGNATURE = 0x10000000;
export const MPQ_FILE_EXISTS = 0x80000000;
export const MPQ_FILE_REPLACEEXISTING = 0x80000000;

// Compression types
export const MPQ_COMPRESSION_HUFFMANN = 0x01;
export const MPQ_COMPRESSION_ZLIB = 0x02;
export const MPQ_COMPRESSION_PKWARE = 0x08;
export const MPQ_COMPRESSION_BZIP2 = 0x10;
export const MPQ_COMPRESSION_SPARSE = 0x20;
export const MPQ_COMPRESSION_ADPCM_MONO = 0x40;
export const MPQ_COMPRESSION_ADPCM_STEREO = 0x80;
export const MPQ_COMPRESSION_LZMA = 0x12;
export const MPQ_COMPRESSION_NEXT_SAME = 0xFFFFFFFF;

// Wave quality constants
export const MPQ_WAVE_QUALITY_HIGH = 0;
export const MPQ_WAVE_QUALITY_MEDIUM = 1;
export const MPQ_WAVE_QUALITY_LOW = 2;

// HET and BET table signatures
export const HET_TABLE_SIGNATURE = 0x1A544548;
export const BET_TABLE_SIGNATURE = 0x1A544542;

// Decryption keys
export const MPQ_KEY_HASH_TABLE = 0xC3AF3770;
export const MPQ_KEY_BLOCK_TABLE = 0xEC83B3A3;

// Internal file names
export const LISTFILE_NAME = '(listfile)';
export const SIGNATURE_NAME = '(signature)';
export const ATTRIBUTES_NAME = '(attributes)';
export const PATCH_METADATA_NAME = '(patch_metadata)';

// MPQ format versions
export const MPQ_FORMAT_VERSION_1 = 0;
export const MPQ_FORMAT_VERSION_2 = 1;
export const MPQ_FORMAT_VERSION_3 = 2;
export const MPQ_FORMAT_VERSION_4 = 3;

// Attributes flags
export const MPQ_ATTRIBUTE_CRC32 = 0x00000001;
export const MPQ_ATTRIBUTE_FILETIME = 0x00000002;
export const MPQ_ATTRIBUTE_MD5 = 0x00000004;
export const MPQ_ATTRIBUTE_PATCH_BIT = 0x00000008;
export const MPQ_ATTRIBUTE_ALL = 0x0000000F;

// Base provider flags
export const BASE_PROVIDER_FILE = 0x00000000;
export const BASE_PROVIDER_MAP = 0x00000001;
export const BASE_PROVIDER_MPQ = 0x00000002;
export const BASE_PROVIDER_HTTP = 0x00000003;
export const BASE_PROVIDER_MASK = 0x0000000F;

// Stream provider flags
export const STREAM_PROVIDER_FLAT = 0x00000000;
export const STREAM_PROVIDER_PARTIAL = 0x00000010;
export const STREAM_PROVIDER_MPQE = 0x00000020;
export const STREAM_PROVIDER_BLOCK4 = 0x00000030;
export const STREAM_PROVIDER_MASK = 0x000000F0;

// Stream flags
export const STREAM_FLAG_READ_ONLY = 0x00000100;
export const STREAM_FLAG_WRITE_SHARE = 0x00000200;
export const STREAM_FLAG_USE_BITMAP = 0x00000400;
export const STREAM_OPTIONS_MASK = 0x0000FF00;
export const STREAM_PROVIDERS_MASK = 0x000000FF;
export const STREAM_FLAGS_MASK = 0x0000FFFF;

// Archive open flags
export const MPQ_OPEN_NO_LISTFILE = 0x00010000;
export const MPQ_OPEN_NO_ATTRIBUTES = 0x00020000;
export const MPQ_OPEN_NO_HEADER_SEARCH = 0x00040000;
export const MPQ_OPEN_FORCE_MPQ_V1 = 0x00080000;
export const MPQ_OPEN_CHECK_SECTOR_CRC = 0x00100000;
export const MPQ_OPEN_PATCH = 0x00200000;
export const MPQ_OPEN_FORCE_LISTFILE = 0x00400000;
export const MPQ_OPEN_READ_ONLY = STREAM_FLAG_READ_ONLY;

// Archive create flags
export const MPQ_CREATE_LISTFILE = 0x00100000;
export const MPQ_CREATE_ATTRIBUTES = 0x00200000;
export const MPQ_CREATE_SIGNATURE = 0x00400000;
export const MPQ_CREATE_ARCHIVE_V1 = 0x00000000;
export const MPQ_CREATE_ARCHIVE_V2 = 0x01000000;
export const MPQ_CREATE_ARCHIVE_V3 = 0x02000000;
export const MPQ_CREATE_ARCHIVE_V4 = 0x03000000;
export const MPQ_CREATE_ARCHIVE_VMASK = 0x0F000000;

// File verification flags
export const SFILE_VERIFY_SECTOR_CRC = 0x00000001;
export const SFILE_VERIFY_FILE_CRC = 0x00000002;
export const SFILE_VERIFY_FILE_MD5 = 0x00000004;
export const SFILE_VERIFY_RAW_MD5 = 0x00000008;
export const SFILE_VERIFY_ALL = 0x0000000F;

// Verification return values
export const VERIFY_OPEN_ERROR = 0x0001;
export const VERIFY_READ_ERROR = 0x0002;
export const VERIFY_FILE_HAS_SECTOR_CRC = 0x0004;
export const VERIFY_FILE_SECTOR_CRC_ERROR = 0x0008;
export const VERIFY_FILE_HAS_CHECKSUM = 0x0010;
export const VERIFY_FILE_CHECKSUM_ERROR = 0x0020;
export const VERIFY_FILE_HAS_MD5 = 0x0040;
export const VERIFY_FILE_MD5_ERROR = 0x0080;
export const VERIFY_FILE_HAS_RAW_MD5 = 0x0100;
export const VERIFY_FILE_RAW_MD5_ERROR = 0x0200;
export const VERIFY_FILE_ERROR_MASK = (
  VERIFY_OPEN_ERROR |
  VERIFY_READ_ERROR |
  VERIFY_FILE_SECTOR_CRC_ERROR |
  VERIFY_FILE_CHECKSUM_ERROR |
  VERIFY_FILE_MD5_ERROR |
  VERIFY_FILE_RAW_MD5_ERROR
);

// Signature types
export const SIGNATURE_TYPE_NONE = 0x0000;
export const SIGNATURE_TYPE_WEAK = 0x0001;
export const SIGNATURE_TYPE_STRONG = 0x0002;

// Archive verification return values
export const ERROR_NO_SIGNATURE = 0;
export const ERROR_VERIFY_FAILED = 1;
export const ERROR_WEAK_SIGNATURE_OK = 2;
export const ERROR_WEAK_SIGNATURE_ERROR = 3;
export const ERROR_STRONG_SIGNATURE_OK = 4;
export const ERROR_STRONG_SIGNATURE_ERROR = 5;

// Compact callback types
export const CCB_CHECKING_FILES = 1;
export const CCB_CHECKING_HASH_TABLE = 2;
export const CCB_COPYING_NON_MPQ_DATA = 3;
export const CCB_COMPACTING_FILES = 4;
export const CCB_CLOSING_ARCHIVE = 5;

// Info classes for SFileGetFileInfo / Archive.getFileInfo / File.getFileInfo
// (values match the SFileInfoClass enum in StormLib.h)
export enum SFileInfoClass {
  // Archive-level info classes (use with Archive.getFileInfo)
  MpqFileName = 0,
  MpqStreamBitmap = 1,
  MpqUserDataOffset = 2,
  MpqUserDataHeader = 3,
  MpqUserData = 4,
  MpqHeaderOffset = 5,
  MpqHeaderSize = 6,
  MpqHeader = 7,
  MpqHetTableOffset = 8,
  MpqHetTableSize = 9,
  MpqHetHeader = 10,
  MpqHetTable = 11,
  MpqBetTableOffset = 12,
  MpqBetTableSize = 13,
  MpqBetHeader = 14,
  MpqBetTable = 15,
  MpqHashTableOffset = 16,
  MpqHashTableSize64 = 17,
  MpqHashTableSize = 18,
  MpqHashTable = 19,
  MpqBlockTableOffset = 20,
  MpqBlockTableSize64 = 21,
  MpqBlockTableSize = 22,
  MpqBlockTable = 23,
  MpqHiBlockTableOffset = 24,
  MpqHiBlockTableSize64 = 25,
  MpqHiBlockTable = 26,
  MpqSignatures = 27,
  MpqStrongSignatureOffset = 28,
  MpqStrongSignatureSize = 29,
  MpqStrongSignature = 30,
  MpqArchiveSize64 = 31,
  MpqArchiveSize = 32,
  MpqMaxFileCount = 33,
  MpqFileTableSize = 34,
  MpqSectorSize = 35,
  MpqNumberOfFiles = 36,
  MpqRawChunkSize = 37,
  MpqStreamFlags = 38,
  MpqFlags = 39,
  // File-level info classes (use with File.getFileInfo)
  InfoPatchChain = 40,
  InfoFileEntry = 41,
  InfoHashEntry = 42,
  InfoHashIndex = 43,
  InfoNameHash1 = 44,
  InfoNameHash2 = 45,
  InfoNameHash3 = 46,
  InfoLocale = 47,
  InfoFileIndex = 48,
  InfoByteOffset = 49,
  InfoFileTime = 50,
  InfoFileSize = 51,
  InfoCompressedSize = 52,
  InfoFlags = 53,
  InfoEncryptionKey = 54,
  InfoEncryptionKeyRaw = 55,
  InfoCRC32 = 56,
  InfoMD5 = 57
}

// Locale constants
export const LANG_NEUTRAL = 0x00;

// File seek methods (for SetFilePointer)
export const FILE_BEGIN = 0;
export const FILE_CURRENT = 1;
export const FILE_END = 2;
