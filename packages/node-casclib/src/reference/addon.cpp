#include <napi.h>
#include <string>
#include "storage.h"
#include "file.h"
#include "errors.h"
#include "CascLib.h"
#include "CascCommon.h"

// Wrapper for CascOpenLocalFile
Napi::Value OpenLocalFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected filename as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filename = info[0].As<Napi::String>().Utf8Value();
  DWORD flags = 0;

  if (info.Length() > 1 && info[1].IsNumber()) {
    flags = info[1].As<Napi::Number>().Uint32Value();
  }

  HANDLE hFile;
  if (!CascOpenLocalFile(filename.c_str(), flags, &hFile)) {
    ThrowCascError(env, "Failed to open local file: " + filename);
    return env.Null();
  }

  return CascFile::NewInstance(env, hFile);
}

// Wrapper for GetCascError
Napi::Value GetError(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  DWORD error = GetCascError();
  return Napi::Number::New(env, error);
}

// Wrapper for SetCascError
Napi::Value SetError(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected error code as first argument")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  DWORD error = info[0].As<Napi::Number>().Uint32Value();
  SetCascError(error);

  return env.Undefined();
}

// Wrapper for CascCdnGetDefault
Napi::Value CdnGetDefault(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  LPCTSTR cdnUrl = CascCdnGetDefault();
  
  if (cdnUrl == nullptr) {
    return env.Null();
  }
  
  return Napi::String::New(env, cdnUrl);
}

// Wrapper for CascCdnDownload
Napi::Value CdnDownload(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected cdnHostUrl, product, and fileName as arguments")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString() || !info[1].IsString() || !info[2].IsString()) {
    Napi::TypeError::New(env, "All arguments must be strings")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string cdnHostUrl = info[0].As<Napi::String>().Utf8Value();
  std::string product = info[1].As<Napi::String>().Utf8Value();
  std::string fileName = info[2].As<Napi::String>().Utf8Value();
  DWORD dwSize = 0;

  LPBYTE data = CascCdnDownload(cdnHostUrl.c_str(), product.c_str(), fileName.c_str(), &dwSize);
  
  if (data == nullptr || dwSize == 0) {
    return env.Null();
  }

  // Copy the data to a Node.js Buffer and free the original
  Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, data, dwSize);
  CascCdnFree(data);
  
  return buffer;
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Initialize Storage class
  CascStorage::Init(env, exports);
  
  // Initialize File class  
  CascFile::Init(env, exports);

  // Export utility functions
  exports.Set("CascOpenLocalFile", Napi::Function::New(env, OpenLocalFile));
  exports.Set("GetCascError", Napi::Function::New(env, GetError));
  exports.Set("SetCascError", Napi::Function::New(env, SetError));
  
  // Export CDN functions
  exports.Set("CascCdnGetDefault", Napi::Function::New(env, CdnGetDefault));
  exports.Set("CascCdnDownload", Napi::Function::New(env, CdnDownload));

  // Export version constants
  exports.Set("CASCLIB_VERSION", Napi::Number::New(env, CASCLIB_VERSION));

  // Export file positioning constants
  #ifdef _WIN32
    exports.Set("FILE_BEGIN", Napi::Number::New(env, FILE_BEGIN));
    exports.Set("FILE_CURRENT", Napi::Number::New(env, FILE_CURRENT));
    exports.Set("FILE_END", Napi::Number::New(env, FILE_END));
  #else
    exports.Set("FILE_BEGIN", Napi::Number::New(env, SEEK_SET));
    exports.Set("FILE_CURRENT", Napi::Number::New(env, SEEK_CUR));
    exports.Set("FILE_END", Napi::Number::New(env, SEEK_END));
  #endif

  // Export other useful constants
  exports.Set("CASC_FILEID_FORMAT", Napi::String::New(env, CASC_FILEID_FORMAT));
  exports.Set("CASC_PARAM_SEPARATOR", Napi::String::New(env, std::string(1, CASC_PARAM_SEPARATOR)));

  // Export progress message constants
  exports.Set("CascProgressLoadingFile", Napi::Number::New(env, CascProgressLoadingFile));
  exports.Set("CascProgressLoadingManifest", Napi::Number::New(env, CascProgressLoadingManifest));
  exports.Set("CascProgressDownloadingFile", Napi::Number::New(env, CascProgressDownloadingFile));
  exports.Set("CascProgressLoadingIndexes", Napi::Number::New(env, CascProgressLoadingIndexes));
  exports.Set("CascProgressDownloadingArchiveIndexes", Napi::Number::New(env, CascProgressDownloadingArchiveIndexes));

  // Export constants - Open flags
  exports.Set("CASC_OPEN_BY_NAME", Napi::Number::New(env, CASC_OPEN_BY_NAME));
  exports.Set("CASC_OPEN_BY_CKEY", Napi::Number::New(env, CASC_OPEN_BY_CKEY));
  exports.Set("CASC_OPEN_BY_EKEY", Napi::Number::New(env, CASC_OPEN_BY_EKEY));
  exports.Set("CASC_OPEN_BY_FILEID", Napi::Number::New(env, CASC_OPEN_BY_FILEID));
  exports.Set("CASC_OPEN_TYPE_MASK", Napi::Number::New(env, CASC_OPEN_TYPE_MASK));
  exports.Set("CASC_OPEN_FLAGS_MASK", Napi::Number::New(env, CASC_OPEN_FLAGS_MASK));
  exports.Set("CASC_STRICT_DATA_CHECK", Napi::Number::New(env, CASC_STRICT_DATA_CHECK));
  exports.Set("CASC_OVERCOME_ENCRYPTED", Napi::Number::New(env, CASC_OVERCOME_ENCRYPTED));
  exports.Set("CASC_OPEN_CKEY_ONCE", Napi::Number::New(env, CASC_OPEN_CKEY_ONCE));

  // Export constants - Locale flags
  exports.Set("CASC_LOCALE_ALL", Napi::Number::New(env, CASC_LOCALE_ALL));
  exports.Set("CASC_LOCALE_ALL_WOW", Napi::Number::New(env, CASC_LOCALE_ALL_WOW));
  exports.Set("CASC_LOCALE_NONE", Napi::Number::New(env, CASC_LOCALE_NONE));
  exports.Set("CASC_LOCALE_UNKNOWN1", Napi::Number::New(env, CASC_LOCALE_UNKNOWN1));
  exports.Set("CASC_LOCALE_ENUS", Napi::Number::New(env, CASC_LOCALE_ENUS));
  exports.Set("CASC_LOCALE_KOKR", Napi::Number::New(env, CASC_LOCALE_KOKR));
  exports.Set("CASC_LOCALE_RESERVED", Napi::Number::New(env, CASC_LOCALE_RESERVED));
  exports.Set("CASC_LOCALE_FRFR", Napi::Number::New(env, CASC_LOCALE_FRFR));
  exports.Set("CASC_LOCALE_DEDE", Napi::Number::New(env, CASC_LOCALE_DEDE));
  exports.Set("CASC_LOCALE_ZHCN", Napi::Number::New(env, CASC_LOCALE_ZHCN));
  exports.Set("CASC_LOCALE_ESES", Napi::Number::New(env, CASC_LOCALE_ESES));
  exports.Set("CASC_LOCALE_ZHTW", Napi::Number::New(env, CASC_LOCALE_ZHTW));
  exports.Set("CASC_LOCALE_ENGB", Napi::Number::New(env, CASC_LOCALE_ENGB));
  exports.Set("CASC_LOCALE_ENCN", Napi::Number::New(env, CASC_LOCALE_ENCN));
  exports.Set("CASC_LOCALE_ENTW", Napi::Number::New(env, CASC_LOCALE_ENTW));
  exports.Set("CASC_LOCALE_ESMX", Napi::Number::New(env, CASC_LOCALE_ESMX));
  exports.Set("CASC_LOCALE_RURU", Napi::Number::New(env, CASC_LOCALE_RURU));
  exports.Set("CASC_LOCALE_PTBR", Napi::Number::New(env, CASC_LOCALE_PTBR));
  exports.Set("CASC_LOCALE_ITIT", Napi::Number::New(env, CASC_LOCALE_ITIT));
  exports.Set("CASC_LOCALE_PTPT", Napi::Number::New(env, CASC_LOCALE_PTPT));

  // Export constants - Content flags
  exports.Set("CASC_CFLAG_INSTALL", Napi::Number::New(env, CASC_CFLAG_INSTALL));
  exports.Set("CASC_CFLAG_LOAD_ON_WINDOWS", Napi::Number::New(env, CASC_CFLAG_LOAD_ON_WINDOWS));
  exports.Set("CASC_CFLAG_LOAD_ON_MAC", Napi::Number::New(env, CASC_CFLAG_LOAD_ON_MAC));
  exports.Set("CASC_CFLAG_X86_32", Napi::Number::New(env, CASC_CFLAG_X86_32));
  exports.Set("CASC_CFLAG_X86_64", Napi::Number::New(env, CASC_CFLAG_X86_64));
  exports.Set("CASC_CFLAG_LOW_VIOLENCE", Napi::Number::New(env, CASC_CFLAG_LOW_VIOLENCE));
  exports.Set("CASC_CFLAG_DONT_LOAD", Napi::Number::New(env, CASC_CFLAG_DONT_LOAD));
  exports.Set("CASC_CFLAG_UPDATE_PLUGIN", Napi::Number::New(env, CASC_CFLAG_UPDATE_PLUGIN));
  exports.Set("CASC_CFLAG_ARM64", Napi::Number::New(env, CASC_CFLAG_ARM64));
  exports.Set("CASC_CFLAG_ENCRYPTED", Napi::Number::New(env, CASC_CFLAG_ENCRYPTED));
  exports.Set("CASC_CFLAG_NO_NAME_HASH", Napi::Number::New(env, CASC_CFLAG_NO_NAME_HASH));
  exports.Set("CASC_CFLAG_UNCMN_RESOLUTION", Napi::Number::New(env, CASC_CFLAG_UNCMN_RESOLUTION));
  exports.Set("CASC_CFLAG_BUNDLE", Napi::Number::New(env, CASC_CFLAG_BUNDLE));
  exports.Set("CASC_CFLAG_NO_COMPRESSION", Napi::Number::New(env, CASC_CFLAG_NO_COMPRESSION));

  // Export constants - Hash sizes
  exports.Set("MD5_HASH_SIZE", Napi::Number::New(env, MD5_HASH_SIZE));
  exports.Set("MD5_STRING_SIZE", Napi::Number::New(env, MD5_STRING_SIZE));
  exports.Set("SHA1_HASH_SIZE", Napi::Number::New(env, SHA1_HASH_SIZE));
  exports.Set("SHA1_STRING_SIZE", Napi::Number::New(env, SHA1_STRING_SIZE));

  // Export constants - Invalid values
  exports.Set("CASC_INVALID_INDEX", Napi::Number::New(env, CASC_INVALID_INDEX));
  exports.Set("CASC_INVALID_SIZE", Napi::Number::New(env, CASC_INVALID_SIZE));
  exports.Set("CASC_INVALID_POS", Napi::Number::New(env, CASC_INVALID_POS));
  exports.Set("CASC_INVALID_ID", Napi::Number::New(env, CASC_INVALID_ID));
  exports.Set("CASC_INVALID_OFFS64", Napi::Number::New(env, (double)CASC_INVALID_OFFS64));
  exports.Set("CASC_INVALID_SIZE64", Napi::Number::New(env, (double)CASC_INVALID_SIZE64));
  // Note: CASC_INVALID_SIZE_T is (size_t)(-1), which may not be accurately representable in JS

  // Export constants - Storage info classes
  exports.Set("CascStorageLocalFileCount", Napi::Number::New(env, CascStorageLocalFileCount));
  exports.Set("CascStorageTotalFileCount", Napi::Number::New(env, CascStorageTotalFileCount));
  exports.Set("CascStorageFeatures", Napi::Number::New(env, CascStorageFeatures));
  exports.Set("CascStorageInstalledLocales", Napi::Number::New(env, CascStorageInstalledLocales));
  exports.Set("CascStorageProduct", Napi::Number::New(env, CascStorageProduct));
  exports.Set("CascStorageTags", Napi::Number::New(env, CascStorageTags));
  exports.Set("CascStoragePathProduct", Napi::Number::New(env, CascStoragePathProduct));

  // Export constants - File info classes
  exports.Set("CascFileContentKey", Napi::Number::New(env, CascFileContentKey));
  exports.Set("CascFileEncodedKey", Napi::Number::New(env, CascFileEncodedKey));
  exports.Set("CascFileFullInfo", Napi::Number::New(env, CascFileFullInfo));
  exports.Set("CascFileSpanInfo", Napi::Number::New(env, CascFileSpanInfo));

  // Export constants - Feature flags
  exports.Set("CASC_FEATURE_FILE_NAMES", Napi::Number::New(env, CASC_FEATURE_FILE_NAMES));
  exports.Set("CASC_FEATURE_ROOT_CKEY", Napi::Number::New(env, CASC_FEATURE_ROOT_CKEY));
  exports.Set("CASC_FEATURE_TAGS", Napi::Number::New(env, CASC_FEATURE_TAGS));
  exports.Set("CASC_FEATURE_FNAME_HASHES", Napi::Number::New(env, CASC_FEATURE_FNAME_HASHES));
  exports.Set("CASC_FEATURE_FNAME_HASHES_OPTIONAL", Napi::Number::New(env, CASC_FEATURE_FNAME_HASHES_OPTIONAL));
  exports.Set("CASC_FEATURE_FILE_DATA_IDS", Napi::Number::New(env, CASC_FEATURE_FILE_DATA_IDS));
  exports.Set("CASC_FEATURE_LOCALE_FLAGS", Napi::Number::New(env, CASC_FEATURE_LOCALE_FLAGS));
  exports.Set("CASC_FEATURE_CONTENT_FLAGS", Napi::Number::New(env, CASC_FEATURE_CONTENT_FLAGS));
  exports.Set("CASC_FEATURE_DATA_ARCHIVES", Napi::Number::New(env, CASC_FEATURE_DATA_ARCHIVES));
  exports.Set("CASC_FEATURE_DATA_FILES", Napi::Number::New(env, CASC_FEATURE_DATA_FILES));
  exports.Set("CASC_FEATURE_ONLINE", Napi::Number::New(env, CASC_FEATURE_ONLINE));
  exports.Set("CASC_FEATURE_FORCE_DOWNLOAD", Napi::Number::New(env, CASC_FEATURE_FORCE_DOWNLOAD));
  exports.Set("CASC_FEATURE_ALLOW_DOWNLOAD", Napi::Number::New(env, CASC_FEATURE_ALLOW_DOWNLOAD));

  // Export constants - Key length
  exports.Set("CASC_KEY_LENGTH", Napi::Number::New(env, CASC_KEY_LENGTH));

  return exports;
}

NODE_API_MODULE(casclib, InitAll)
