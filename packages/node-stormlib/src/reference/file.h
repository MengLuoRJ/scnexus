#ifndef STORMLIB_FILE_H
#define STORMLIB_FILE_H

#include <napi.h>
#include <memory>
#include <stdexcept>
#include "StormLib.h"

class MpqFile : public Napi::ObjectWrap<MpqFile> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  static Napi::Object NewInstance(Napi::Env env, HANDLE hFile);
  MpqFile(const Napi::CallbackInfo& info);
  ~MpqFile();
  void Attach(Napi::Object parent, std::shared_ptr<size_t> children, std::shared_ptr<size_t> pending) {
    owner = Napi::Persistent(parent); childCount = children; parentPending = pending; ++*childCount;
  }

private:
  template<Napi::Value (MpqFile::*method)(const Napi::CallbackInfo&)>
  Napi::Value Guard(const Napi::CallbackInfo& info) {
    if (busy || (parentPending && *parentPending)) {
      Napi::Error::New(info.Env(), "Native operation is pending").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    try { return (this->*method)(info); }
    catch (const Napi::Error& error) { error.ThrowAsJavaScriptException(); }
    catch (const std::exception& error) { Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException(); }
    return info.Env().Undefined();
  }
  void Detach() { if (childCount) { --*childCount; childCount.reset(); } owner.Reset(); parentPending.reset(); }
  bool busy = false;
  Napi::ObjectReference owner;
  std::shared_ptr<size_t> childCount, parentPending;
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
