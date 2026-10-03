#include "file.h"
#include "errors.h"
#include <vector>
#include <cmath>
#include <stdexcept>

static DWORD RemainingBytes(HANDLE handle) {
  ULONGLONG size = 0, position = 0;
  if (!CascGetFileSize64(handle, &size) || !CascSetFilePointer64(handle, 0, &position, FILE_CURRENT)) throw std::runtime_error("Failed to get file size or position");
  ULONGLONG remaining = position < size ? size - position : 0;
  if (remaining > 256 * 1024 * 1024) throw std::range_error("Read exceeds 256 MiB limit; use chunked reads");
  return DWORD(remaining);
}

static Napi::Value ExactInteger(Napi::Env env, ULONGLONG value) {
  if (value > 9007199254740991ULL) return Napi::BigInt::New(env, uint64_t(value));
  return Napi::Number::New(env, double(value));
}

Napi::FunctionReference CascFile::constructor;

// Reads the remaining file contents on a worker thread. CASC reads can
// trigger CDN downloads for online storages, so this must not block the
// event loop. The receiver keeps the JS File object (and thus the native
// object) alive while the worker runs; Guard prevents conflicting calls.
class CascReadAllWorker : public Napi::AsyncWorker {
public:
  CascReadAllWorker(Napi::Env env, Napi::Object receiver, CascFile* file)
    : Napi::AsyncWorker(env, "casclib:readAllAsync"),
      deferred(Napi::Promise::Deferred::New(env)),
      receiverRef(Napi::Persistent(receiver)),
      file(file), bytesRead(0), errorCode(0) {}

  void Execute() override {
    DWORD fileSize;
    try { fileSize = RemainingBytes(file->hFile); }
    catch (const std::exception& error) { SetError(error.what()); return; }
    if (fileSize == 0) {
      return;
    }
    try { buffer.resize(fileSize); }
    catch (const std::exception& error) { SetError(error.what()); return; }
    if (!CascReadFile(file->hFile, buffer.data(), fileSize, &bytesRead)) {
      errorCode = GetCascError();
      SetError("Failed to read file");
    }
  }

  void OnOK() override {
    file->busy = false;
    if (file->parentPending) --*file->parentPending;
    deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), buffer.data(), bytesRead));
  }

  void OnError(const Napi::Error& e) override {
    file->busy = false;
    if (file->parentPending) --*file->parentPending;
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
    InstanceMethod("CascReadFile", &CascFile::Guard<&CascFile::Read>),
    InstanceMethod("readFileAll", &CascFile::Guard<&CascFile::ReadAll>),
    InstanceMethod("readAllAsync", &CascFile::Guard<&CascFile::ReadAllAsync>),
    InstanceMethod("CascGetFileSize", &CascFile::Guard<&CascFile::GetSize>),
    InstanceMethod("CascGetFileSize64", &CascFile::Guard<&CascFile::GetSize64>),
    InstanceMethod("CascGetFilePointer", &CascFile::Guard<&CascFile::GetPosition>),
    InstanceMethod("CascGetFilePointer64", &CascFile::Guard<&CascFile::GetPosition64>),
    InstanceMethod("CascSetFilePointer", &CascFile::Guard<&CascFile::SetPosition>),
    InstanceMethod("CascSetFilePointer64", &CascFile::Guard<&CascFile::SetPosition64>),
    InstanceMethod("CascGetFileInfo", &CascFile::Guard<&CascFile::GetFileInfo>),
    InstanceMethod("CascSetFileFlags", &CascFile::Guard<&CascFile::SetFileFlags>),
    InstanceMethod("CascCloseFile", &CascFile::Guard<&CascFile::Close>)
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
  Detach();
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
    double requested = info[0].As<Napi::Number>().DoubleValue();
    if (!std::isfinite(requested) || requested < 0 || requested > 256 * 1024 * 1024 || std::floor(requested) != requested) {
      Napi::RangeError::New(env, "Read size must be an integer between 0 and 256 MiB").ThrowAsJavaScriptException();
      return env.Null();
    }
    bytesToRead = DWORD(requested);
  } else if (info.Length() > 0 && !info[0].IsUndefined()) {
    Napi::TypeError::New(env, "Read size must be a number").ThrowAsJavaScriptException();
    return env.Null();
  }

  if (bytesToRead == 0) return Napi::Buffer<uint8_t>::New(env, 0);
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

  DWORD fileSize;
  try { fileSize = RemainingBytes(hFile); }
  catch (const std::exception& error) {
    Napi::RangeError::New(env, error.what()).ThrowAsJavaScriptException();
    return env.Null();
  }
  
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
  busy = true;
  if (parentPending) ++*parentPending;
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

  Detach();
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

  return ExactInteger(env, fileSize);
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

  return ExactInteger(env, position);
}

Napi::Value CascFile::SetPosition64(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || (!info[0].IsNumber() && !info[0].IsBigInt())) {
    Napi::TypeError::New(env, "Expected position as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LONGLONG position = 0;
  if (info[0].IsBigInt()) {
    bool lossless = false;
    position = info[0].As<Napi::BigInt>().Int64Value(&lossless);
    if (!lossless) {
      Napi::RangeError::New(env, "Position must fit a signed 64-bit integer").ThrowAsJavaScriptException();
      return env.Null();
    }
  } else {
    double requested = info[0].As<Napi::Number>().DoubleValue();
    if (!std::isfinite(requested) || std::abs(requested) > 9007199254740991.0 || std::floor(requested) != requested) {
      Napi::RangeError::New(env, "Position must be a bigint or safe integer").ThrowAsJavaScriptException();
      return env.Null();
    }
    position = LONGLONG(requested);
  }
  DWORD moveMethod = FILE_BEGIN;

  if (info.Length() > 1 && info[1].IsNumber()) {
    moveMethod = info[1].As<Napi::Number>().Uint32Value();
  }

  ULONGLONG newPosition = 0;
  if (!CascSetFilePointer64(hFile, position, &newPosition, moveMethod)) {
    ThrowCascError(env, "Failed to set file position");
    return env.Null();
  }

  return ExactInteger(env, newPosition);
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
        result.Set("storageOffset", ExactInteger(env, fullInfo.StorageOffset));
        result.Set("segmentOffset", ExactInteger(env, fullInfo.SegmentOffset));
        result.Set("tagBitMask", ExactInteger(env, fullInfo.TagBitMask));
        result.Set("fileNameHash", ExactInteger(env, fullInfo.FileNameHash));
        result.Set("contentSize", ExactInteger(env, fullInfo.ContentSize));
        result.Set("encodedSize", ExactInteger(env, fullInfo.EncodedSize));
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
