#include "storage.h"
#include "file.h"
#include "errors.h"
#include <string>

Napi::FunctionReference CascStorage::constructor;

// Opens a local or online CASC storage off the event loop. Online storages
// hit Blizzard's CDN and can block for minutes, so a worker thread is the
// only acceptable place for that call. The receiver keeps the JS Storage
// object alive while the worker runs.
class OpenStorageWorker : public Napi::AsyncWorker {
public:
  OpenStorageWorker(Napi::Env env, Napi::Object receiver, CascStorage* storage,
                    std::string path, DWORD flags, bool online)
    : Napi::AsyncWorker(env, online ? "casclib:openOnlineAsync" : "casclib:openAsync"),
      deferred(Napi::Promise::Deferred::New(env)),
      receiverRef(Napi::Persistent(receiver)),
      storage(storage), path(std::move(path)), flags(flags), online(online),
      hStorage(nullptr), errorCode(0) {}

  void Execute() override {
    bool ok = online
      ? CascOpenOnlineStorage(path.c_str(), flags, &hStorage)
      : CascOpenStorage(path.c_str(), flags, &hStorage);
    if (!ok) {
      errorCode = GetCascError();
      SetError(std::string(online ? "Failed to open online CASC storage: "
                                  : "Failed to open CASC storage: ") + path);
    }
  }

  void OnOK() override {
    storage->hStorage = hStorage;
    storage->isOpen = true;
    deferred.Resolve(Napi::Boolean::New(Env(), true));
  }

  void OnError(const Napi::Error& e) override {
    std::string message = e.Message() + " (CascError=" + std::to_string(errorCode) +
                          " " + CascErrorName(errorCode) + ")";
    deferred.Reject(MakeCascError(Env(), message, errorCode).Value());
  }

  Napi::Promise Promise() { return deferred.Promise(); }

private:
  Napi::Promise::Deferred deferred;
  Napi::ObjectReference receiverRef;
  CascStorage* storage;
  std::string path;
  DWORD flags;
  bool online;
  HANDLE hStorage;
  DWORD errorCode;
};

Napi::Object CascStorage::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "Storage", {
    InstanceMethod("CascOpenStorage", &CascStorage::Open),
    InstanceMethod("CascOpenOnlineStorage", &CascStorage::OpenOnline),
    InstanceMethod("openAsync", &CascStorage::OpenAsync),
    InstanceMethod("openOnlineAsync", &CascStorage::OpenOnlineAsync),
    InstanceMethod("CascOpenStorageEx", &CascStorage::OpenEx),
    InstanceMethod("CascCloseStorage", &CascStorage::Close),
    InstanceMethod("CascOpenFile", &CascStorage::OpenFile),
    InstanceMethod("CascGetFileInfo", &CascStorage::GetFileInfo),
    InstanceMethod("fileExists", &CascStorage::FileExists),
    InstanceMethod("CascGetStorageInfo", &CascStorage::GetStorageInfo),
    InstanceMethod("CascFindFirstFile", &CascStorage::FindFirstFile),
    InstanceMethod("CascFindNextFile", &CascStorage::FindNextFile),
    InstanceMethod("CascFindClose", &CascStorage::FindClose),
    InstanceMethod("CascAddEncryptionKey", &CascStorage::AddEncryptionKey),
    InstanceMethod("CascAddStringEncryptionKey", &CascStorage::AddStringEncryptionKey),
    InstanceMethod("CascImportKeysFromString", &CascStorage::ImportKeysFromString),
    InstanceMethod("CascImportKeysFromFile", &CascStorage::ImportKeysFromFile),
    InstanceMethod("CascFindEncryptionKey", &CascStorage::FindEncryptionKey),
    InstanceMethod("CascGetNotFoundEncryptionKey", &CascStorage::GetNotFoundEncryptionKey)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Storage", func);
  return exports;
}

CascStorage::CascStorage(const Napi::CallbackInfo& info) 
  : Napi::ObjectWrap<CascStorage>(info), hStorage(nullptr), hFind(nullptr), isOpen(false), isFindOpen(false) {
  Napi::Env env = info.Env();
  
  if (info.Length() > 0) {
    // Auto-open if path is provided
    Napi::Object obj = info.This().As<Napi::Object>();
    Open(info);
  }
}

CascStorage::~CascStorage() {
  if (isFindOpen && hFind) {
    CascFindClose(hFind);
    hFind = nullptr;
    isFindOpen = false;
  }
  if (isOpen && hStorage) {
    CascCloseStorage(hStorage);
    hStorage = nullptr;
    isOpen = false;
  }
}

Napi::Value CascStorage::Open(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected storage path as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Storage path must be a string")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (isOpen) {
    Napi::Error::New(env, "Storage is already open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();
  DWORD flags = 0;

  if (info.Length() > 1 && info[1].IsNumber()) {
    flags = info[1].As<Napi::Number>().Uint32Value();
  }

  if (!CascOpenStorage(path.c_str(), flags, &hStorage)) {
    ThrowCascError(env, "Failed to open CASC storage: " + path);
    return env.Null();
  }

  isOpen = true;
  return Napi::Boolean::New(env, true);
}

// Shared argument parsing + worker queueing for openAsync/openOnlineAsync.
static Napi::Value QueueOpenStorageWorker(const Napi::CallbackInfo& info, CascStorage* self,
                                          bool isOpenAlready, bool online) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected storage path as first argument")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (isOpenAlready) {
    Napi::Error::New(env, "Storage is already open")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();
  DWORD flags = 0;
  if (info.Length() > 1 && info[1].IsNumber()) {
    flags = info[1].As<Napi::Number>().Uint32Value();
  }

  auto* worker = new OpenStorageWorker(env, info.This().As<Napi::Object>(), self,
                                       std::move(path), flags, online);
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value CascStorage::OpenAsync(const Napi::CallbackInfo& info) {
  return QueueOpenStorageWorker(info, this, isOpen, false);
}

Napi::Value CascStorage::OpenOnlineAsync(const Napi::CallbackInfo& info) {
  return QueueOpenStorageWorker(info, this, isOpen, true);
}

Napi::Value CascStorage::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen) {
    return Napi::Boolean::New(env, false);
  }

  if (hStorage) {
    CascCloseStorage(hStorage);
    hStorage = nullptr;
    isOpen = false;
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value CascStorage::OpenFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected filename as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filename = info[0].As<Napi::String>().Utf8Value();
  DWORD dwFlags = CASC_OPEN_BY_NAME;

  if (info.Length() > 1 && info[1].IsNumber()) {
    dwFlags = info[1].As<Napi::Number>().Uint32Value();
  }

  HANDLE hFile;
  if (!CascOpenFile(hStorage, filename.c_str(), CASC_LOCALE_ALL, dwFlags, &hFile)) {
    ThrowCascError(env, "Failed to open file: " + filename);
    return env.Null();
  }

  // Create a CascFile object
  Napi::Object fileObj = CascFile::NewInstance(env, hFile);
  return fileObj;
}

Napi::Value CascStorage::GetFileInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected filename as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filename = info[0].As<Napi::String>().Utf8Value();
  
  HANDLE hFile;
  if (!CascOpenFile(hStorage, filename.c_str(), CASC_LOCALE_ALL, CASC_OPEN_BY_NAME, &hFile)) {
    return env.Null();
  }

  DWORD fileSize = CascGetFileSize(hFile, nullptr);
  
  Napi::Object result = Napi::Object::New(env);
  result.Set("name", Napi::String::New(env, filename));
  result.Set("size", Napi::Number::New(env, fileSize));

  CascCloseFile(hFile);
  
  return result;
}

Napi::Value CascStorage::FileExists(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected filename as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filename = info[0].As<Napi::String>().Utf8Value();
  
  HANDLE hFile;
  bool exists = CascOpenFile(hStorage, filename.c_str(), CASC_LOCALE_ALL, CASC_OPEN_BY_NAME, &hFile);
  
  if (exists) {
    CascCloseFile(hFile);
  }

  return Napi::Boolean::New(env, exists);
}

Napi::Value CascStorage::OpenOnline(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected storage path/URL as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Storage path must be a string")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (isOpen) {
    Napi::Error::New(env, "Storage is already open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string path = info[0].As<Napi::String>().Utf8Value();
  DWORD flags = 0;

  if (info.Length() > 1 && info[1].IsNumber()) {
    flags = info[1].As<Napi::Number>().Uint32Value();
  }

  if (!CascOpenOnlineStorage(path.c_str(), flags, &hStorage)) {
    ThrowCascError(env, "Failed to open online CASC storage: " + path);
    return env.Null();
  }

  isOpen = true;
  return Napi::Boolean::New(env, true);
}

Napi::Value CascStorage::OpenEx(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected at least params string as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "First argument must be a string")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (isOpen) {
    Napi::Error::New(env, "Storage is already open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string params = info[0].As<Napi::String>().Utf8Value();
  
  // Initialize CASC_OPEN_STORAGE_ARGS structure
  CASC_OPEN_STORAGE_ARGS args = {0};
  args.Size = sizeof(CASC_OPEN_STORAGE_ARGS);
  args.dwLocaleMask = CASC_LOCALE_ALL;
  args.dwFlags = 0;

  bool bOnlineStorage = false;

  // If second argument is an options object
  if (info.Length() > 1 && info[1].IsObject()) {
    Napi::Object options = info[1].As<Napi::Object>();

    // Extract optional parameters
    if (options.Has("localPath") && options.Get("localPath").IsString()) {
      // LocalPath is stored temporarily - we'll use params for szLocalPath instead
    }

    if (options.Has("codeName") && options.Get("codeName").IsString()) {
      static std::string codeName;
      codeName = options.Get("codeName").As<Napi::String>().Utf8Value();
      args.szCodeName = codeName.c_str();
    }

    if (options.Has("region") && options.Get("region").IsString()) {
      static std::string region;
      region = options.Get("region").As<Napi::String>().Utf8Value();
      args.szRegion = region.c_str();
    }

    if (options.Has("localeMask") && options.Get("localeMask").IsNumber()) {
      args.dwLocaleMask = options.Get("localeMask").As<Napi::Number>().Uint32Value();
    }

    if (options.Has("flags") && options.Get("flags").IsNumber()) {
      args.dwFlags = options.Get("flags").As<Napi::Number>().Uint32Value();
    }

    if (options.Has("buildKey") && options.Get("buildKey").IsString()) {
      static std::string buildKey;
      buildKey = options.Get("buildKey").As<Napi::String>().Utf8Value();
      args.szBuildKey = buildKey.c_str();
    }

    if (options.Has("cdnHostUrl") && options.Get("cdnHostUrl").IsString()) {
      static std::string cdnHostUrl;
      cdnHostUrl = options.Get("cdnHostUrl").As<Napi::String>().Utf8Value();
      args.szCdnHostUrl = cdnHostUrl.c_str();
    }

    if (options.Has("online") && options.Get("online").IsBoolean()) {
      bOnlineStorage = options.Get("online").As<Napi::Boolean>().Value();
    }
  }

  // Call CascOpenStorageEx
  if (!CascOpenStorageEx(params.c_str(), &args, bOnlineStorage, &hStorage)) {
    ThrowCascError(env, "Failed to open CASC storage with extended parameters: " + params);
    return env.Null();
  }

  isOpen = true;
  return Napi::Boolean::New(env, true);
}

Napi::Value CascStorage::GetStorageInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected info class as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  CASC_STORAGE_INFO_CLASS infoClass = (CASC_STORAGE_INFO_CLASS)info[0].As<Napi::Number>().Uint32Value();
  Napi::Object result = Napi::Object::New(env);

  switch (infoClass) {
    case CascStorageLocalFileCount:
    case CascStorageTotalFileCount: {
      DWORD fileCount = 0;
      size_t bytesNeeded = 0;
      if (CascGetStorageInfo(hStorage, infoClass, &fileCount, sizeof(fileCount), &bytesNeeded)) {
        result.Set("fileCount", Napi::Number::New(env, fileCount));
      }
      break;
    }
    case CascStorageFeatures: {
      DWORD features = 0;
      size_t bytesNeeded = 0;
      if (CascGetStorageInfo(hStorage, infoClass, &features, sizeof(features), &bytesNeeded)) {
        result.Set("features", Napi::Number::New(env, features));
      }
      break;
    }
    case CascStorageProduct: {
      CASC_STORAGE_PRODUCT product = {0};
      size_t bytesNeeded = 0;
      if (CascGetStorageInfo(hStorage, infoClass, &product, sizeof(product), &bytesNeeded)) {
        result.Set("codeName", Napi::String::New(env, product.szCodeName));
        result.Set("buildNumber", Napi::Number::New(env, product.BuildNumber));
      }
      break;
    }
    default:
      Napi::Error::New(env, "Unsupported info class")
        .ThrowAsJavaScriptException();
      return env.Null();
  }

  return result;
}

Napi::Value CascStorage::FindFirstFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string maskStr = "*";
  const char* mask = maskStr.c_str();
  const char* listFile = nullptr;
  std::string listFileStr;

  if (info.Length() > 0 && info[0].IsString()) {
    maskStr = info[0].As<Napi::String>().Utf8Value();
    mask = maskStr.c_str();
  }

  if (info.Length() > 1 && info[1].IsString()) {
    listFileStr = info[1].As<Napi::String>().Utf8Value();
    listFile = listFileStr.c_str();
  }

  CASC_FIND_DATA findData = {0};
  hFind = CascFindFirstFile(hStorage, mask, &findData, listFile);

  if (!hFind || hFind == INVALID_HANDLE_VALUE) {
    return env.Null();
  }

  isFindOpen = true;

  Napi::Object result = Napi::Object::New(env);
  result.Set("fileName", Napi::String::New(env, findData.szFileName));
  result.Set("ckey", Napi::Buffer<BYTE>::Copy(env, findData.CKey, MD5_HASH_SIZE));
  result.Set("ekey", Napi::Buffer<BYTE>::Copy(env, findData.EKey, MD5_HASH_SIZE));
  result.Set("tagBitMask", Napi::Number::New(env, (double)findData.TagBitMask));
  result.Set("fileSize", Napi::Number::New(env, (double)findData.FileSize));
  result.Set("plainName", findData.szPlainName ? Napi::String::New(env, findData.szPlainName) : env.Null());
  result.Set("fileDataId", Napi::Number::New(env, findData.dwFileDataId));
  result.Set("localeFlags", Napi::Number::New(env, findData.dwLocaleFlags));
  result.Set("contentFlags", Napi::Number::New(env, findData.dwContentFlags));
  result.Set("spanCount", Napi::Number::New(env, findData.dwSpanCount));
  result.Set("available", Napi::Boolean::New(env, findData.bFileAvailable));
  result.Set("nameType", Napi::Number::New(env, findData.NameType));

  return result;
}

Napi::Value CascStorage::FindNextFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isFindOpen || !hFind) {
    Napi::Error::New(env, "Find operation is not active")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  CASC_FIND_DATA findData = {0};
  if (!CascFindNextFile(hFind, &findData)) {
    return env.Null();
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("fileName", Napi::String::New(env, findData.szFileName));
  result.Set("ckey", Napi::Buffer<BYTE>::Copy(env, findData.CKey, MD5_HASH_SIZE));
  result.Set("ekey", Napi::Buffer<BYTE>::Copy(env, findData.EKey, MD5_HASH_SIZE));
  result.Set("tagBitMask", Napi::Number::New(env, (double)findData.TagBitMask));
  result.Set("fileSize", Napi::Number::New(env, (double)findData.FileSize));
  result.Set("plainName", findData.szPlainName ? Napi::String::New(env, findData.szPlainName) : env.Null());
  result.Set("fileDataId", Napi::Number::New(env, findData.dwFileDataId));
  result.Set("localeFlags", Napi::Number::New(env, findData.dwLocaleFlags));
  result.Set("contentFlags", Napi::Number::New(env, findData.dwContentFlags));
  result.Set("spanCount", Napi::Number::New(env, findData.dwSpanCount));
  result.Set("available", Napi::Boolean::New(env, findData.bFileAvailable));
  result.Set("nameType", Napi::Number::New(env, findData.NameType));

  return result;
}

Napi::Value CascStorage::FindClose(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isFindOpen || !hFind) {
    return Napi::Boolean::New(env, false);
  }

  CascFindClose(hFind);
  hFind = nullptr;
  isFindOpen = false;

  return Napi::Boolean::New(env, true);
}

Napi::Value CascStorage::AddEncryptionKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected keyName and key as arguments")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  ULONGLONG keyName = info[0].As<Napi::Number>().Int64Value();
  
  if (!info[1].IsBuffer()) {
    Napi::TypeError::New(env, "Key must be a Buffer")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Buffer<BYTE> keyBuffer = info[1].As<Napi::Buffer<BYTE>>();

  if (keyBuffer.Length() < CASC_KEY_LENGTH) {
    Napi::TypeError::New(env, "Key must be at least 16 bytes")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LPBYTE key = keyBuffer.Data();

  bool result = CascAddEncryptionKey(hStorage, keyName, key);
  return Napi::Boolean::New(env, result);
}

Napi::Value CascStorage::AddStringEncryptionKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected keyName and key string as arguments")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  ULONGLONG keyName = info[0].As<Napi::Number>().Int64Value();
  std::string keyStr = info[1].As<Napi::String>().Utf8Value();

  bool result = CascAddStringEncryptionKey(hStorage, keyName, keyStr.c_str());
  return Napi::Boolean::New(env, result);
}

Napi::Value CascStorage::ImportKeysFromString(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected key list string as argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string keyList = info[0].As<Napi::String>().Utf8Value();
  bool result = CascImportKeysFromString(hStorage, keyList.c_str());
  return Napi::Boolean::New(env, result);
}

Napi::Value CascStorage::ImportKeysFromFile(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected key file path as argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string filePath = info[0].As<Napi::String>().Utf8Value();
  bool result = CascImportKeysFromFile(hStorage, filePath.c_str());
  return Napi::Boolean::New(env, result);
}

Napi::Value CascStorage::FindEncryptionKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected keyName as argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  ULONGLONG keyName = info[0].As<Napi::Number>().Int64Value();
  LPBYTE key = CascFindEncryptionKey(hStorage, keyName);

  if (!key) {
    return env.Null();
  }

  return Napi::Buffer<BYTE>::Copy(env, key, CASC_KEY_LENGTH);
}

Napi::Value CascStorage::GetNotFoundEncryptionKey(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hStorage) {
    Napi::Error::New(env, "Storage is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  ULONGLONG keyName = 0;
  bool result = CascGetNotFoundEncryptionKey(hStorage, &keyName);

  if (!result) {
    return env.Null();
  }

  return Napi::Number::New(env, (double)keyName);
}
