#include <napi.h>
#include <CascLib.h>
#include <string>
#include <fstream>
#include <filesystem>
#include <vector>
#include <array>
#include <algorithm>

struct FileHandle {
  HANDLE value = nullptr;
  ~FileHandle() { if (value) CascCloseFile(value); }
};
struct FindHandle {
  HANDLE value = INVALID_HANDLE_VALUE;
  ~FindHandle() { if (value != INVALID_HANDLE_VALUE) CascFindClose(value); }
};

static void Failure(Napi::Env env, const std::string& operation) {
  const DWORD code = GetCascError();
  auto error = Napi::Error::New(env, operation + " failed (CascLib error " + std::to_string(code) + ")");
  error.Value().Set("code", Napi::Number::New(env, code));
  throw error;
}

static std::basic_string<TCHAR> DiskPath(const Napi::Value& value) {
#ifdef _WIN32
  const auto text = value.As<Napi::String>().Utf16Value();
  return std::wstring(text.begin(), text.end());
#else
  return value.As<Napi::String>().Utf8Value();
#endif
}

class Storage : public Napi::ObjectWrap<Storage> {
  HANDLE handle = nullptr;
  std::basic_string<TCHAR> localFile;
  HANDLE OpenFile(Napi::Env env, const Napi::Object& selector, DWORD locale, DWORD flags) {
    FileHandle file;
    if (!localFile.empty()) {
      if (!CascOpenLocalFile(localFile.c_str(), flags, &file.value)) Failure(env, "CascOpenLocalFile");
    } else {
      const auto kind = selector.Get("type").As<Napi::String>().Utf8Value();
      std::string name;
      const void* identifier = nullptr;
      std::array<BYTE, 16> key{};
      if (kind == "id") {
        identifier = CASC_FILE_DATA_ID(selector.Get("value").As<Napi::Number>().Uint32Value());
        flags |= CASC_OPEN_BY_FILEID;
      } else if (kind == "ckey" || kind == "ekey") {
        name = selector.Get("value").As<Napi::String>().Utf8Value();
        if (name.size() != 32) throw Napi::TypeError::New(env, "Expected 32 hex characters");
        for (size_t index = 0; index < key.size(); ++index)
          key[index] = static_cast<BYTE>(std::stoul(name.substr(index * 2, 2), nullptr, 16));
        identifier = key.data();
        flags |= kind == "ckey" ? CASC_OPEN_BY_CKEY : CASC_OPEN_BY_EKEY;
      } else {
        name = selector.Get("value").As<Napi::String>().Utf8Value();
        identifier = name.c_str();
      }
      if (!CascOpenFile(handle, identifier, locale, flags, &file.value)) Failure(env, "CascOpenFile");
    }
    const auto result = file.value;
    file.value = nullptr;
    return result;
  }
  static std::string Hex(const BYTE* bytes) {
    static constexpr char digits[] = "0123456789abcdef";
    std::string result;
    for (size_t index = 0; index < 16; ++index) {
      result += digits[bytes[index] >> 4];
      result += digits[bytes[index] & 15];
    }
    return result;
  }
public:
  explicit Storage(const Napi::CallbackInfo& info) : Napi::ObjectWrap<Storage>(info) {
    const auto path = DiskPath(info[0]);
    const auto options = info[1].As<Napi::Object>();
    if (options.Get("localFile").ToBoolean().Value()) { localFile = path; return; }
    CASC_OPEN_STORAGE_ARGS args{};
    args.Size = sizeof(args);
    args.dwLocaleMask = options.Get("locale").As<Napi::Number>().Uint32Value();
    args.dwFlags = options.Get("flags").As<Napi::Number>().Uint32Value();
    std::basic_string<TCHAR> product, region;
    if (options.Has("product")) { product = DiskPath(options.Get("product")); args.szCodeName = product.c_str(); }
    if (options.Has("region")) { region = DiskPath(options.Get("region")); args.szRegion = region.c_str(); }
    if (!CascOpenStorageEx(path.c_str(), &args, options.Get("online").ToBoolean().Value(), &handle))
      Failure(info.Env(), "CascOpenStorageEx");
  }
  ~Storage() { if (handle) CascCloseStorage(handle); }
  Napi::Value Call(const Napi::CallbackInfo& info) {
    const auto env = info.Env();
    const auto operation = info[0].As<Napi::String>().Utf8Value();
    const auto args = info[1].As<Napi::Array>();
    if (operation == "close") {
      if (handle && !CascCloseStorage(handle)) Failure(info.Env(), "CascCloseStorage");
      handle = nullptr;
      localFile.clear();
      return info.Env().Undefined();
    }
    if (!handle && localFile.empty()) throw Napi::Error::New(env, "Storage is closed");
    if (operation == "info") {
      auto result = Napi::Object::New(env);
      const CASC_STORAGE_INFO_CLASS classes[] = {CascStorageLocalFileCount, CascStorageTotalFileCount, CascStorageFeatures};
      const char* names[] = {"localFileCount", "totalFileCount", "features"};
      for (size_t index = 0; index < 3; ++index) {
        DWORD value = 0;
        if (!CascGetStorageInfo(handle, classes[index], &value, sizeof(value), nullptr)) Failure(env, "CascGetStorageInfo");
        result.Set(names[index], value);
      }
      CASC_STORAGE_PRODUCT product{};
      if (!CascGetStorageInfo(handle, CascStorageProduct, &product, sizeof(product), nullptr)) Failure(env, "CascGetStorageInfo");
      result.Set("product", product.szCodeName);
      result.Set("buildNumber", product.BuildNumber);
      return result;
    }
    if (operation == "list") {
      CASC_FIND_DATA data{};
      const auto mask = args.Get(uint32_t(0)).As<Napi::String>().Utf8Value();
      const auto listfile = DiskPath(args.Get(uint32_t(1)));
      FindHandle find;
      find.value = CascFindFirstFile(handle, mask.c_str(), &data, listfile.empty() ? nullptr : listfile.c_str());
      auto result = Napi::Array::New(env);
      if (find.value == INVALID_HANDLE_VALUE) return result;
      uint32_t index = 0;
      do {
        auto entry = Napi::Object::New(env);
        entry.Set("name", data.szFileName);
        entry.Set("size", Napi::Number::New(env, static_cast<double>(data.FileSize)));
        entry.Set("contentKey", Hex(data.CKey));
        entry.Set("encodedKey", Hex(data.EKey));
        entry.Set("fileDataId", data.dwFileDataId);
        entry.Set("locale", data.dwLocaleFlags);
        entry.Set("contentFlags", data.dwContentFlags);
        entry.Set("available", bool(data.bFileAvailable));
        entry.Set("nameType", int(data.NameType));
        result.Set(index++, entry);
      } while (CascFindNextFile(find.value, &data));
      return result;
    }
    if (operation == "key") {
      const auto name = args.Get(uint32_t(0)).As<Napi::BigInt>();
      bool lossless;
      const auto keyName = name.Uint64Value(&lossless);
      if (!lossless) throw Napi::RangeError::New(env, "Key name exceeds uint64");
      const auto key = args.Get(uint32_t(1)).As<Napi::String>().Utf8Value();
      if (!CascAddStringEncryptionKey(handle, keyName, key.c_str())) Failure(env, "CascAddStringEncryptionKey");
      return env.Undefined();
    }
    if (operation == "read" || operation == "extract" || operation == "has") {
      FileHandle file;
      try { file.value = OpenFile(env, args.Get(uint32_t(0)).As<Napi::Object>(),
        args.Get(uint32_t(1)).As<Napi::Number>().Uint32Value(), args.Get(uint32_t(2)).As<Napi::Number>().Uint32Value()); }
      catch (const Napi::Error&) {
        if (operation == "has" && GetCascError() == ERROR_FILE_NOT_FOUND) return Napi::Boolean::New(env, false);
        throw;
      }
      if (operation == "has") return Napi::Boolean::New(env, true);
      ULONGLONG size = 0;
      if (!CascGetFileSize64(file.value, &size)) Failure(env, "CascGetFileSize64");
      if (operation == "read") {
        const auto maximum = args.Get(uint32_t(3)).As<Napi::Number>().Uint32Value();
        if (size > maximum) throw Napi::RangeError::New(env, "File exceeds maxBytes");
        auto buffer = Napi::Buffer<BYTE>::New(env, static_cast<size_t>(size));
        DWORD count = 0;
        if (size && !CascReadFile(file.value, buffer.Data(), static_cast<DWORD>(size), &count)) Failure(env, "CascReadFile");
        if (count != size) throw Napi::Error::New(env, "Unexpected end of CASC file");
        return buffer;
      }
      const auto target = DiskPath(args.Get(uint32_t(3)));
      std::ofstream output(std::filesystem::path(target), std::ios::binary | std::ios::trunc);
      if (!output) throw Napi::Error::New(env, "Cannot open extraction destination");
      std::vector<BYTE> buffer(1024 * 1024);
      while (size) {
        const DWORD requested = static_cast<DWORD>(std::min<ULONGLONG>(size, buffer.size()));
        DWORD count = 0;
        if (!CascReadFile(file.value, buffer.data(), requested, &count)) Failure(env, "CascReadFile");
        if (count != requested) throw Napi::Error::New(env, "Unexpected end of CASC file");
        output.write(reinterpret_cast<const char*>(buffer.data()), count);
        if (!output) throw Napi::Error::New(env, "Cannot write extraction destination");
        size -= count;
      }
      output.close();
      if (!output) throw Napi::Error::New(env, "Cannot close extraction destination");
      return env.Undefined();
    }
    throw Napi::Error::New(info.Env(), "Unknown operation: " + operation);
  }
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("Storage", DefineClass(env, "Storage", {InstanceMethod("call", &Storage::Call)}));
    return exports;
  }
};

static Napi::Object Init(Napi::Env env, Napi::Object exports) { return Storage::Init(env, exports); }
NODE_API_MODULE(node_casclib, Init)
