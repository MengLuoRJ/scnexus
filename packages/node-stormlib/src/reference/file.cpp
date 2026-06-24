#include "file.h"
#include "archive.h"
#include "errors.h"
#include <vector>

Napi::FunctionReference MpqFile::constructor;

// Reads the remaining file contents on a worker thread so large or highly
// compressed files do not block the event loop. The receiver keeps the JS
// File object (and thus the native handle) alive while the worker runs.
class MpqReadAllWorker : public Napi::AsyncWorker {
public:
  MpqReadAllWorker(Napi::Env env, Napi::Object receiver, MpqFile* file)
    : Napi::AsyncWorker(env, "stormlib:readAllAsync"),
      deferred(Napi::Promise::Deferred::New(env)),
      receiverRef(Napi::Persistent(receiver)),
      file(file), bytesRead(0), errorCode(0) {}

  void Execute() override {
    DWORD fileSize = SFileGetFileSize(file->hFile, nullptr);
    if (fileSize == 0 || fileSize == SFILE_INVALID_SIZE) {
      return;
    }
    buffer.resize(fileSize);
    if (!SFileReadFile(file->hFile, buffer.data(), fileSize, &bytesRead, nullptr)) {
      errorCode = SErrGetLastError();
      SetError("Failed to read file");
    }
  }

  void OnOK() override {
    deferred.Resolve(Napi::Buffer<uint8_t>::Copy(Env(), buffer.data(), bytesRead));
  }

  void OnError(const Napi::Error& e) override {
    std::string message = e.Message() + " (StormError=" + std::to_string(errorCode) +
                          " " + StormErrorName(errorCode) + ")";
    deferred.Reject(MakeStormError(Env(), message, errorCode).Value());
  }

  Napi::Promise Promise() { return deferred.Promise(); }

private:
  Napi::Promise::Deferred deferred;
  Napi::ObjectReference receiverRef;
  MpqFile* file;
  std::vector<uint8_t> buffer;
  DWORD bytesRead;
  DWORD errorCode;
};

Napi::Object MpqFile::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "File", {
    InstanceMethod("SFileReadFile", &MpqFile::Read),
    InstanceMethod("readFileAll", &MpqFile::ReadAll),
    InstanceMethod("readAllAsync", &MpqFile::ReadAllAsync),
    InstanceMethod("SFileWriteFile", &MpqFile::Write),
    InstanceMethod("SFileFinishFile", &MpqFile::Finish),
    InstanceMethod("SFileGetFileSize", &MpqFile::GetSize),
    InstanceMethod("SFileGetFilePointer", &MpqFile::GetPosition),
    InstanceMethod("SFileSetFilePointer", &MpqFile::SetPosition),
    InstanceMethod("SFileGetFileName", &MpqFile::GetFileName),
    InstanceMethod("SFileSetFileLocale", &MpqFile::SetLocale),
    InstanceMethod("SFileGetFileInfo", &MpqFile::GetFileInfo),
    InstanceMethod("SFileGetFileArchive", &MpqFile::GetFileArchive),
    InstanceMethod("SFileCloseFile", &MpqFile::Close)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("File", func);
  return exports;
}

Napi::Object MpqFile::NewInstance(Napi::Env env, HANDLE hFile) {
  Napi::EscapableHandleScope scope(env);
  Napi::Object obj = constructor.New({});
  MpqFile* file = Napi::ObjectWrap<MpqFile>::Unwrap(obj);
  file->hFile = hFile;
  file->isOpen = true;
  return scope.Escape(napi_value(obj)).ToObject();
}

MpqFile::MpqFile(const Napi::CallbackInfo& info) 
  : Napi::ObjectWrap<MpqFile>(info), hFile(nullptr), isOpen(false) {
}

MpqFile::~MpqFile() {
  if (isOpen && hFile) {
    SFileCloseFile(hFile);
    hFile = nullptr;
    isOpen = false;
  }
}

Napi::Value MpqFile::Read(const Napi::CallbackInfo& info) {
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

  if (!SFileReadFile(hFile, buffer.data(), bytesToRead, &bytesRead, nullptr)) {
    ThrowStormError(env, "Failed to read file");
    return env.Null();
  }

  return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), bytesRead);
}

Napi::Value MpqFile::ReadAll(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD fileSize = SFileGetFileSize(hFile, nullptr);
  
  if (fileSize == 0 || fileSize == SFILE_INVALID_SIZE) {
    return Napi::Buffer<uint8_t>::New(env, 0);
  }

  std::vector<uint8_t> buffer(fileSize);
  DWORD bytesRead = 0;

  if (!SFileReadFile(hFile, buffer.data(), fileSize, &bytesRead, nullptr)) {
    ThrowStormError(env, "Failed to read file");
    return env.Null();
  }

  return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), bytesRead);
}

Napi::Value MpqFile::ReadAllAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  auto* worker = new MpqReadAllWorker(env, info.This().As<Napi::Object>(), this);
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value MpqFile::GetSize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  DWORD fileSize = SFileGetFileSize(hFile, nullptr);
  return Napi::Number::New(env, fileSize);
}

Napi::Value MpqFile::GetPosition(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LONG distanceToMove = 0;
  DWORD position = SFileSetFilePointer(hFile, distanceToMove, nullptr, FILE_CURRENT);
  
  return Napi::Number::New(env, position);
}

Napi::Value MpqFile::SetPosition(const Napi::CallbackInfo& info) {
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
  DWORD newPosition = SFileSetFilePointer(hFile, position, nullptr, FILE_BEGIN);

  return Napi::Number::New(env, newPosition);
}

Napi::Value MpqFile::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen) {
    return Napi::Boolean::New(env, false);
  }

  if (hFile) {
    SFileCloseFile(hFile);
    hFile = nullptr;
    isOpen = false;
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value MpqFile::Write(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected buffer as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  DWORD compression = MPQ_COMPRESSION_ZLIB;

  if (info.Length() > 1 && info[1].IsNumber()) {
    compression = info[1].As<Napi::Number>().Uint32Value();
  }

  if (!SFileWriteFile(hFile, buffer.Data(), buffer.Length(), compression)) {
    ThrowStormError(env, "Failed to write to file");
    return env.Null();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value MpqFile::Finish(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!SFileFinishFile(hFile)) {
    ThrowStormError(env, "Failed to finish file");
    return env.Null();
  }

  // File is closed after finishing
  hFile = nullptr;
  isOpen = false;

  return Napi::Boolean::New(env, true);
}

Napi::Value MpqFile::GetFileName(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  char filename[MAX_PATH];
  if (!SFileGetFileName(hFile, filename)) {
    ThrowStormError(env, "Failed to get file name");
    return env.Null();
  }

  return Napi::String::New(env, filename);
}

Napi::Value MpqFile::SetLocale(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "Expected locale as first argument")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  LCID newLocale = info[0].As<Napi::Number>().Uint32Value();

  if (!SFileSetFileLocale(hFile, newLocale)) {
    ThrowStormError(env, "Failed to set file locale");
    return env.Null();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value MpqFile::GetFileInfo(const Napi::CallbackInfo& info) {
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

  SFileInfoClass infoClass = (SFileInfoClass)info[0].As<Napi::Number>().Uint32Value();
  DWORD lengthNeeded = 0;

  // First call to get size needed
  SFileGetFileInfo(hFile, infoClass, nullptr, 0, &lengthNeeded);

  if (lengthNeeded == 0) {
    return env.Null();
  }

  // Allocate buffer and get info
  std::vector<uint8_t> buffer(lengthNeeded);
  if (!SFileGetFileInfo(hFile, infoClass, buffer.data(), lengthNeeded, nullptr)) {
    ThrowStormError(env, "Failed to get file info");
    return env.Null();
  }

  return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), lengthNeeded);
}

Napi::Value MpqFile::GetFileArchive(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isOpen || !hFile) {
    Napi::Error::New(env, "File is not open")
      .ThrowAsJavaScriptException();
    return env.Null();
  }

  HANDLE hMpq;
  if (!SFileGetFileArchive(hFile, &hMpq)) {
    ThrowStormError(env, "Failed to get the archive that owns this file");
    return env.Null();
  }

  // Borrowed handle: it belongs to whichever Archive originally opened it
  // (or a patch archive in its chain), so this wrapper must never close it.
  return MpqArchive::NewInstance(env, hMpq, false);
}

