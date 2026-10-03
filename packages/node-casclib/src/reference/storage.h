#ifndef CASCLIB_STORAGE_H
#define CASCLIB_STORAGE_H

#include <napi.h>
#include <memory>
#include "CascLib.h"

class CascStorage : public Napi::ObjectWrap<CascStorage> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  CascStorage(const Napi::CallbackInfo& info);
  ~CascStorage();
  void BeginOperation() { ++*pending; }

private:
  template<Napi::Value (CascStorage::*method)(const Napi::CallbackInfo&)>
  Napi::Value Guard(const Napi::CallbackInfo& info) {
    if (*pending || (method == &CascStorage::Close && *children)) {
      Napi::Error::New(info.Env(), "Native operation is pending or files are still open").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    return (this->*method)(info);
  }
  std::shared_ptr<size_t> children = std::make_shared<size_t>(0);
  std::shared_ptr<size_t> pending = std::make_shared<size_t>(0);
  static Napi::FunctionReference constructor;
  friend class OpenStorageWorker;

  // Methods
  Napi::Value Open(const Napi::CallbackInfo& info);
  Napi::Value OpenOnline(const Napi::CallbackInfo& info);
  Napi::Value OpenAsync(const Napi::CallbackInfo& info);
  Napi::Value OpenOnlineAsync(const Napi::CallbackInfo& info);
  Napi::Value OpenEx(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value OpenFile(const Napi::CallbackInfo& info);
  Napi::Value GetFileInfo(const Napi::CallbackInfo& info);
  Napi::Value FileExists(const Napi::CallbackInfo& info);
  Napi::Value GetStorageInfo(const Napi::CallbackInfo& info);
  
  // Find methods
  Napi::Value FindFirstFile(const Napi::CallbackInfo& info);
  Napi::Value FindNextFile(const Napi::CallbackInfo& info);
  Napi::Value FindClose(const Napi::CallbackInfo& info);
  
  // Encryption key methods
  Napi::Value AddEncryptionKey(const Napi::CallbackInfo& info);
  Napi::Value AddStringEncryptionKey(const Napi::CallbackInfo& info);
  Napi::Value ImportKeysFromString(const Napi::CallbackInfo& info);
  Napi::Value ImportKeysFromFile(const Napi::CallbackInfo& info);
  Napi::Value FindEncryptionKey(const Napi::CallbackInfo& info);
  Napi::Value GetNotFoundEncryptionKey(const Napi::CallbackInfo& info);

  // Member variables
  HANDLE hStorage;
  HANDLE hFind;
  bool isOpen;
  bool isFindOpen;
};

#endif // CASCLIB_STORAGE_H
