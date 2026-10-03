#ifndef CASCLIB_STORAGE_H
#define CASCLIB_STORAGE_H

#include <napi.h>
#include "CascLib.h"

class CascStorage : public Napi::ObjectWrap<CascStorage> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  CascStorage(const Napi::CallbackInfo& info);
  ~CascStorage();

private:
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
