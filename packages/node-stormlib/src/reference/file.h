#ifndef STORMLIB_FILE_H
#define STORMLIB_FILE_H

#include <napi.h>
#include "StormLib.h"

class MpqFile : public Napi::ObjectWrap<MpqFile> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::Object NewInstance(Napi::Env env, HANDLE hFile);
  MpqFile(const Napi::CallbackInfo& info);
  ~MpqFile();

private:
  static Napi::FunctionReference constructor;
  friend class MpqReadAllWorker;

  // Methods
  Napi::Value Read(const Napi::CallbackInfo& info);
  Napi::Value ReadAll(const Napi::CallbackInfo& info);
  Napi::Value ReadAllAsync(const Napi::CallbackInfo& info);
  Napi::Value Write(const Napi::CallbackInfo& info);
  Napi::Value Finish(const Napi::CallbackInfo& info);
  Napi::Value GetSize(const Napi::CallbackInfo& info);
  Napi::Value GetPosition(const Napi::CallbackInfo& info);
  Napi::Value SetPosition(const Napi::CallbackInfo& info);
  Napi::Value GetFileName(const Napi::CallbackInfo& info);
  Napi::Value SetLocale(const Napi::CallbackInfo& info);
  Napi::Value GetFileInfo(const Napi::CallbackInfo& info);
  Napi::Value GetFileArchive(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);

  // Member variables
  HANDLE hFile;
  bool isOpen;
};

#endif // STORMLIB_FILE_H
