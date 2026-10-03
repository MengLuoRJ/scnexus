#ifndef STORMLIB_ARCHIVE_H
#define STORMLIB_ARCHIVE_H

#include <napi.h>
#include <memory>
#include "StormLib.h"

// Define INVALID_HANDLE_VALUE for non-Windows platforms
#ifndef INVALID_HANDLE_VALUE
#define INVALID_HANDLE_VALUE ((HANDLE)-1)
#endif

class MpqArchive : public Napi::ObjectWrap<MpqArchive> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  // Wraps an already-open archive handle (e.g. from SFileOpenFileArchive or
  // SFileGetFileArchive). When `owned` is false, Close()/the destructor will
  // not call SFileCloseArchive — the handle is borrowed from its original
  // opener and closing it here would be a double-close.
  static Napi::Object NewInstance(Napi::Env env, HANDLE hMpq, bool owned);
  MpqArchive(const Napi::CallbackInfo& info);
  ~MpqArchive();
  void Attach(Napi::Object parent, std::shared_ptr<size_t> count, std::shared_ptr<size_t> state) {
    owner = Napi::Persistent(parent); parentChildren = count; pending = state; ++*parentChildren;
  }

private:
  friend class MpqFile;
  void Detach() { if (parentChildren) { --*parentChildren; parentChildren.reset(); } owner.Reset(); }
  Napi::ObjectReference owner;
  std::shared_ptr<size_t> parentChildren;
  template<Napi::Value (MpqArchive::*method)(const Napi::CallbackInfo&)>
  Napi::Value Guard(const Napi::CallbackInfo& info) {
    if (*pending || (method == &MpqArchive::Close && *children)) {
      Napi::Error::New(info.Env(), "Native operation is pending or files are still open").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }
    return (this->*method)(info);
  }
  std::shared_ptr<size_t> children = std::make_shared<size_t>(0);
  std::shared_ptr<size_t> pending = std::make_shared<size_t>(0);
  static Napi::FunctionReference constructor;
  friend class OpenArchiveWorker;
  friend class ExtractFileWorker;
  friend class OpenFileArchiveWorker;

  // Archive operations
  Napi::Value Open(const Napi::CallbackInfo& info);
  Napi::Value OpenAsync(const Napi::CallbackInfo& info);
  Napi::Value Create(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value Flush(const Napi::CallbackInfo& info);
  Napi::Value Compact(const Napi::CallbackInfo& info);

  // File operations
  Napi::Value OpenFile(const Napi::CallbackInfo& info);
  Napi::Value OpenFileArchive(const Napi::CallbackInfo& info);
  Napi::Value OpenFileArchiveAsync(const Napi::CallbackInfo& info);
  Napi::Value HasFile(const Napi::CallbackInfo& info);
  Napi::Value ExtractFile(const Napi::CallbackInfo& info);
  Napi::Value ExtractFileAsync(const Napi::CallbackInfo& info);
  Napi::Value AddFile(const Napi::CallbackInfo& info);
  Napi::Value AddFileEx(const Napi::CallbackInfo& info);
  Napi::Value RemoveFile(const Napi::CallbackInfo& info);
  Napi::Value RenameFile(const Napi::CallbackInfo& info);
  
  // Archive info
  Napi::Value GetMaxFileCount(const Napi::CallbackInfo& info);
  Napi::Value SetMaxFileCount(const Napi::CallbackInfo& info);
  Napi::Value GetAttributes(const Napi::CallbackInfo& info);
  Napi::Value SetAttributes(const Napi::CallbackInfo& info);
  
  // Verification
  Napi::Value VerifyFile(const Napi::CallbackInfo& info);
  Napi::Value VerifyArchive(const Napi::CallbackInfo& info);
  Napi::Value SignArchive(const Napi::CallbackInfo& info);
  Napi::Value GetFileChecksums(const Napi::CallbackInfo& info);
  
  // Listfile operations
  Napi::Value AddListFile(const Napi::CallbackInfo& info);
  
  // Patch archive operations
  Napi::Value OpenPatchArchive(const Napi::CallbackInfo& info);
  Napi::Value IsPatchedArchive(const Napi::CallbackInfo& info);
  
  // File finding operations
  Napi::Value FindFirstFile(const Napi::CallbackInfo& info);
  Napi::Value EnumLocales(const Napi::CallbackInfo& info);
  
  // Advanced file creation
  Napi::Value CreateFile(const Napi::CallbackInfo& info);
  Napi::Value AddWave(const Napi::CallbackInfo& info);
  Napi::Value UpdateFileAttributes(const Napi::CallbackInfo& info);
  
  // Get file info
  Napi::Value GetFileInfo(const Napi::CallbackInfo& info);

  // Static locale methods
  static Napi::Value GetLocale(const Napi::CallbackInfo& info);
  static Napi::Value SetLocale(const Napi::CallbackInfo& info);

  // Member variables
  HANDLE hMpq;
  bool isOpen;
  bool owned = true;
};

#endif // STORMLIB_ARCHIVE_H
