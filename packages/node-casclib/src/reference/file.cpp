#include "file.h"
#include "errors.h"
#include <vector>

Napi::FunctionReference CascFile::constructor;

// Reads the remaining file contents on a worker thread. CASC reads can
// trigger CDN downloads for online storages, so this must not block the
// event loop. The receiver keeps the JS File object (and thus the native
// handle) alive while the worker runs.
class CascReadAllWorker : public Napi::AsyncWorker {
public:
  CascReadAllWorker(Napi::Env env, Napi::Object receiver, CascFile* file)
    : Napi::AsyncWorker(env, "casclib:readAllAsync"),
      deferred(Napi::Promise::Deferred::New(env)),
      receiverRef(Napi::Persistent(receiver)),
      file(file), bytesRead(0), errorCode(0) {}

  void Execute() override {
    DWORD fileSize = CascGetFileSize(file->hFile, nullptr);
    if (fileSize == 0) {
      return;
    }
    buffer.resize(fileSize);
    if (!CascReadFile(file->hFile, buffer.data(), fileSize, &bytesRead)) {
      errorCode = GetCascError();
      SetError("Failed to read file");
    }
  }

  void OnOK() override {
    deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), buffer.data(), bytesRead));
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
  CascFile* file;
  std::vector<uint8_t> buffer;
  DWORD bytesRead;
  DWORD errorCode;
};

Napi::Object CascFile::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "File", {
    InstanceMethod("CascReadFile", &CascFile::Read),
    InstanceMethod("readFileAll", &CascFile::ReadAll),
    InstanceMethod("readAllAsync", &CascFile::ReadAllAsync),
    InstanceMethod("CascGetFileSize", &CascFile::GetSize),
    InstanceMethod("CascGetFileSize64", &CascFile::GetSize64),
    InstanceMethod("CascGetFilePointer", &CascFile::GetPosition),
    InstanceMethod("CascGetFilePointer64", &CascFile::GetPosition64),
    InstanceMethod("CascSetFilePointer", &CascFile::SetPosition),
    InstanceMethod("CascSetFilePointer64", &CascFile::SetPosition64),
    InstanceMethod("CascGetFileInfo", &CascFile::GetFileInfo),
    InstanceMethod("CascSetFileFlags", &CascFile::SetFileFlags),
    InstanceMethod("CascCloseFile", &CascFile::Close)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("File", func);
  return exports;
}

Napi::Object CascFile::NewInstance(Napi::Env env, HANDLE hFile) {
  Napi::EscapableHandleScope scope(env);
  Napi::Object obj = constructor.New({});
  CascFile* file = Napi::ObjectWrap<CascFile>::Unwrap(obj);
  file->hFile = hFile;
  file->isOpen = true;
  return scope.Escape(napi_value(obj)).ToObject();
}

CascFile::CascFile(const Napi::CallbackInfo& info) 
  : Napi::ObjectWrap<CascFile>(info), hFile(nullptr), isOpen(false) {
}

CascFile::~CascFile() {
  if (isOpen && hFile) {
    CascCloseFile(hFile);
    hFile = nullptr;
    isOpen = false;
  }
}

Napi::Value CascFile::Read(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD bytesToRead = 4096; // Default buffer size
  if (info.Length() > 0 && info[0].IsNumber()) {
    bytesToRead = info[0].As<Napi::Number>().Uint32Value();
  }

  std::vector<uint8_t> buffer(bytesToRead);
  DWORD bytesRead = 0;

  if (!CascReadFile(hFile, buffer.data(), bytesToRead, &bytesRead)) {
    ThrowCascError(env, "Failed to read file");
    return env.Null();
  }

  return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), bytesRead);
}

Napi::Value CascFile::ReadAll(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD fileSize = CascGetFileSize(hFile, nullptr);
  
  if (fileSize == 0) {
    return Napi::Buffer<uint8_t>::New(env, 0);
  }

  std::vector<uint8_t> buffer(fileSize);
  DWORD bytesRead = 0;

  if (!CascReadFile(hFile, buffer.data(), fileSize, &bytesRead)) {
    ThrowCascError(env, "Failed to read file");
    return env.Null();
  }

  return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), bytesRead);
}

Napi::Value CascFile::ReadAllAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto* worker = new CascReadAllWorker(env, info.This().As<Napi::Object>(), this);
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value CascFile::GetSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD fileSize = CascGetFileSize(hFile, nullptr);
  return Napi::Number::New(env, fileSize);
}

Napi::Value CascFile::GetPosition(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LONG distanceToMove = 0;
  DWORD position = CascSetFilePointer(hFile, distanceToMove, nullptr, FILE_CURRENT);
  
  return Napi::Number::New(env, position);
}

Napi::Value CascFile::SetPosition(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected position as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LONG position = info[0].As<Napi::Number>().Int32Value();
  DWORD newPosition = CascSetFilePointer(hFile, position, nullptr, FILE_BEGIN);

  return Napi::Number::New(env, newPosition);
}

Napi::Value CascFile::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen) {
    return Napi::Boolean::New(env, false);
  }

  if (hFile) {
    CascCloseFile(hFile);
    hFile = nullptr;
    isOpen = false;
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value CascFile::GetSize64(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  ULONGLONG fileSize = 0;
  if (!CascGetFileSize64(hFile, &fileSize)) {
    ThrowCascError(env, "Failed to get file size");
    return env.Null();
  }

  return Napi::Number::New(env, (double)fileSize);
}

Napi::Value CascFile::GetPosition64(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  ULONGLONG position = 0;
  if (!CascSetFilePointer64(hFile, 0, &position, FILE_CURRENT)) {
    ThrowCascError(env, "Failed to get file position");
    return env.Null();
  }

  return Napi::Number::New(env, (double)position);
}

Napi::Value CascFile::SetPosition64(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected position as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LONGLONG position = (LONGLONG)info[0].As<Napi::Number>().Int64Value();
  DWORD moveMethod = FILE_BEGIN;

  if (info.Length() > 1 && info[1].IsNumber()) {
    moveMethod = info[1].As<Napi::Number>().Uint32Value();
  }

  ULONGLONG newPosition = 0;
  if (!CascSetFilePointer64(hFile, position, &newPosition, moveMethod)) {
    ThrowCascError(env, "Failed to set file position");
    return env.Null();
  }

  return Napi::Number::New(env, (double)newPosition);
}

Napi::Value CascFile::GetFileInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected info class as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  CASC_FILE_INFO_CLASS infoClass = (CASC_FILE_INFO_CLASS)info[0].As<Napi::Number>().Uint32Value();
  Napi::Object result = Napi::Object::New(env);

  switch (infoClass) {
    case CascFileContentKey: {
      BYTE ckey[MD5_HASH_SIZE] = {0};
      size_t bytesNeeded = 0;
      if (CascGetFileInfo(hFile, infoClass, ckey, sizeof(ckey), &bytesNeeded)) {
        result.Set("ckey", Napi::Buffer<BYTE>::Copy(env, ckey, MD5_HASH_SIZE));
      }
      break;
    }
    case CascFileEncodedKey: {
      BYTE ekey[MD5_HASH_SIZE] = {0};
      size_t bytesNeeded = 0;
      if (CascGetFileInfo(hFile, infoClass, ekey, sizeof(ekey), &bytesNeeded)) {
        result.Set("ekey", Napi::Buffer<BYTE>::Copy(env, ekey, MD5_HASH_SIZE));
      }
      break;
    }
    case CascFileFullInfo: {
      CASC_FILE_FULL_INFO fullInfo = {0};
      size_t bytesNeeded = 0;
      if (CascGetFileInfo(hFile, infoClass, &fullInfo, sizeof(fullInfo), &bytesNeeded)) {
        result.Set("ckey", Napi::Buffer<BYTE>::Copy(env, fullInfo.CKey, MD5_HASH_SIZE));
        result.Set("ekey", Napi::Buffer<BYTE>::Copy(env, fullInfo.EKey, MD5_HASH_SIZE));
        result.Set("dataFileName", Napi::String::New(env, fullInfo.DataFileName));
        result.Set("storageOffset", Napi::Number::New(env, (double)fullInfo.StorageOffset));
        result.Set("segmentOffset", Napi::Number::New(env, (double)fullInfo.SegmentOffset));
        result.Set("tagBitMask", Napi::Number::New(env, (double)fullInfo.TagBitMask));
        result.Set("fileNameHash", Napi::Number::New(env, (double)fullInfo.FileNameHash));
        result.Set("contentSize", Napi::Number::New(env, (double)fullInfo.ContentSize));
        result.Set("encodedSize", Napi::Number::New(env, (double)fullInfo.EncodedSize));
        result.Set("segmentIndex", Napi::Number::New(env, fullInfo.SegmentIndex));
        result.Set("spanCount", Napi::Number::New(env, fullInfo.SpanCount));
        result.Set("fileDataId", Napi::Number::New(env, fullInfo.FileDataId));
        result.Set("localeFlags", Napi::Number::New(env, fullInfo.LocaleFlags));
        result.Set("contentFlags", Napi::Number::New(env, fullInfo.ContentFlags));
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

Napi::Value CascFile::SetFileFlags(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected flags as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD flags = info[0].As<Napi::Number>().Uint32Value();
  bool result = CascSetFileFlags(hFile, flags);

  return Napi::Boolean::New(env, result);
}
