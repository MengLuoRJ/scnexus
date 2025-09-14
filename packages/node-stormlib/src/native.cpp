#include <napi.h>
#include <StormLib.h>
#include <algorithm>
#include <memory>
#include <string>

static void Fail(Napi::Env env, const std::string& operation, DWORD code = SErrGetLastError()) {
  auto error = Napi::Error::New(env, operation + " failed (StormLib " + std::to_string(code) + ")");
  error.Value().Set("code", Napi::Number::New(env, code));
  throw error;
}

static std::basic_string<TCHAR> DiskPath(const std::string& path) {
#ifdef _WIN32
  const int length = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.data(), static_cast<int>(path.size()), nullptr, 0);
  if (!length) throw std::runtime_error("Invalid UTF-8 filesystem path");
  std::wstring result(length, L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.data(), static_cast<int>(path.size()), result.data(), length);
  return result;
#else
  return path;
#endif
}

struct FileCloser {
  void operator()(void* handle) const { if (handle) SFileCloseFile(handle); }
};
struct FindCloser {
  void operator()(void* handle) const { if (handle) SFileFindClose(handle); }
};

class Archive : public Napi::ObjectWrap<Archive> {
 public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("Archive", DefineClass(env, "Archive", {
      InstanceMethod("call", &Archive::Call)
    }));
    return exports;
  }

  explicit Archive(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Archive>(info) {
    if (info.Length() != 3 || !info[0].IsString() || !info[1].IsString() || !info[2].IsNumber()) {
      throw Napi::TypeError::New(info.Env(), "Expected path, mode and capacity");
    }
    const auto path = DiskPath(info[0].As<Napi::String>().Utf8Value());
    const auto mode = info[1].As<Napi::String>().Utf8Value();
    writable = mode != "read";
    const bool success = mode == "create"
      ? SFileCreateArchive(path.c_str(), MPQ_CREATE_LISTFILE, info[2].As<Napi::Number>().Uint32Value(), &handle)
      : SFileOpenArchive(path.c_str(), 0, writable ? 0 : MPQ_OPEN_READ_ONLY, &handle);
    if (!success) Fail(info.Env(), mode);
  }

  ~Archive() { if (handle) SFileCloseArchive(handle); }

 private:
  HANDLE handle = nullptr;
  bool writable = false;

  Napi::Value Call(const Napi::CallbackInfo& info) {
    const auto env = info.Env();
    if (info.Length() != 2 || !info[0].IsString() || !info[1].IsArray()) {
      throw Napi::TypeError::New(env, "Expected operation and argument array");
    }
    const auto operation = info[0].As<Napi::String>().Utf8Value();
    const auto args = info[1].As<Napi::Array>();
    if (operation == "close" && !handle) return env.Undefined();
    if (!handle) throw Napi::Error::New(env, "Archive is closed");
    const auto text = [&](uint32_t index) {
      const auto value = args.Get(index);
      if (!value.IsString()) throw Napi::TypeError::New(env, "Expected string argument");
      const auto result = value.As<Napi::String>().Utf8Value();
      if (result.empty() || result.find('\0') != std::string::npos) {
        throw Napi::TypeError::New(env, "Invalid empty or NUL-containing path");
      }
      return result;
    };
    const auto number = [&](uint32_t index) {
      const auto value = args.Get(index);
      if (!value.IsNumber()) throw Napi::TypeError::New(env, "Expected numeric argument");
      return value.As<Napi::Number>().Uint32Value();
    };
    if (operation == "count") {
      DWORD count = 0;
      if (!SFileGetFileInfo(handle, SFileMpqNumberOfFiles, &count, sizeof(count), nullptr)) Fail(env, operation);
      return Napi::Number::New(env, count);
    }
    if (operation == "has") return Napi::Boolean::New(env, SFileHasFile(handle, text(0).c_str()));
    if (operation == "listfile") {
      const auto path = DiskPath(text(0));
      const auto code = SFileAddListFile(handle, path.c_str());
      if (code != ERROR_SUCCESS) Fail(env, operation, code);
      return env.Undefined();
    }
    if (operation == "list") {
      SFILE_FIND_DATA data{};
      HANDLE found = SFileFindFirstFile(handle, "*", &data, nullptr);
      auto result = Napi::Array::New(env);
      if (!found || found == INVALID_HANDLE_VALUE) {
        const auto code = SErrGetLastError();
        if (code != ERROR_NO_MORE_FILES && code != ERROR_FILE_NOT_FOUND) Fail(env, operation, code);
        return result;
      }
      std::unique_ptr<void, FindCloser> search(found);
      uint32_t index = 0;
      do {
        auto entry = Napi::Object::New(env);
        entry.Set("name", data.cFileName);
        entry.Set("size", data.dwFileSize);
        entry.Set("compressedSize", data.dwCompSize);
        entry.Set("flags", data.dwFileFlags);
        entry.Set("locale", data.lcLocale);
        entry.Set("blockIndex", data.dwBlockIndex);
        entry.Set("hashIndex", data.dwHashIndex);
        result.Set(index++, entry);
      } while (SFileFindNextFile(found, &data));
      const auto code = SErrGetLastError();
      if (code != ERROR_NO_MORE_FILES) Fail(env, operation, code);
      return result;
    }
    if (operation == "read") {
      HANDLE opened = nullptr;
      if (!SFileOpenFileEx(handle, text(0).c_str(), SFILE_OPEN_FROM_MPQ, &opened)) Fail(env, operation);
      std::unique_ptr<void, FileCloser> file(opened);
      DWORD high = 0;
      SErrSetLastError(ERROR_SUCCESS);
      const DWORD size = SFileGetFileSize(opened, &high);
      if (size == SFILE_INVALID_SIZE && SErrGetLastError() != ERROR_SUCCESS) Fail(env, operation);
      if (high || size > number(1)) throw Napi::RangeError::New(env, "File exceeds read limit");
      auto result = Napi::Buffer<char>::New(env, size);
      DWORD offset = 0;
      while (offset < size) {
        DWORD bytes = 0;
        const DWORD requested = std::min<DWORD>(size - offset, 1024 * 1024);
        if (!SFileReadFile(opened, result.Data() + offset, requested, &bytes, nullptr)) Fail(env, operation);
        if (bytes != requested) throw Napi::Error::New(env, "Unexpected end of MPQ file");
        offset += bytes;
      }
      return result;
    }
    if (operation == "extract") {
      const auto destination = DiskPath(text(1));
      if (!SFileExtractFile(handle, text(0).c_str(), destination.c_str(), SFILE_OPEN_FROM_MPQ)) Fail(env, operation);
      return env.Undefined();
    }
    if (operation == "close") {
      if (!SFileCloseArchive(handle)) Fail(env, operation);
      handle = nullptr;
      return env.Undefined();
    }
    if (!writable) throw Napi::Error::New(env, "Archive is read-only");
    bool success = false;
    if (operation == "add") {
      const auto source = DiskPath(text(0));
      const auto compression = number(3);
      success = SFileAddFileEx(handle, source.c_str(), text(1).c_str(), number(2), compression, compression);
    } else if (operation == "delete") {
      success = SFileRemoveFile(handle, text(0).c_str(), SFILE_OPEN_FROM_MPQ);
    } else if (operation == "rename") {
      success = SFileRenameFile(handle, text(0).c_str(), text(1).c_str());
    } else if (operation == "flush") {
      success = SFileFlushArchive(handle);
    } else if (operation == "compact") {
      success = SFileCompactArchive(handle, nullptr, false);
    } else {
      throw Napi::TypeError::New(env, "Unknown StormLib operation");
    }
    if (!success) Fail(env, operation);
    return env.Undefined();
  }
};

static Napi::Object Initialize(Napi::Env env, Napi::Object exports) {
  return Archive::Init(env, exports);
}

NODE_API_MODULE(node_stormlib, Initialize)
