#include "errors.h"
#include "StormLib.h"
#include "StormPort.h"
#include <errno.h>
#include <string.h>

const char* StormErrorName(uint32_t code) {
  switch (code) {
    case ERROR_SUCCESS:               return "ERROR_SUCCESS";
    case ERROR_FILE_NOT_FOUND:        return "ERROR_FILE_NOT_FOUND";
    case ERROR_ACCESS_DENIED:         return "ERROR_ACCESS_DENIED";
    case ERROR_INVALID_HANDLE:        return "ERROR_INVALID_HANDLE";
    case ERROR_NOT_ENOUGH_MEMORY:     return "ERROR_NOT_ENOUGH_MEMORY";
    case ERROR_NOT_SUPPORTED:         return "ERROR_NOT_SUPPORTED";
    case ERROR_INVALID_PARAMETER:     return "ERROR_INVALID_PARAMETER";
    case ERROR_NEGATIVE_SEEK:         return "ERROR_NEGATIVE_SEEK";
    case ERROR_DISK_FULL:             return "ERROR_DISK_FULL";
    case ERROR_ALREADY_EXISTS:        return "ERROR_ALREADY_EXISTS";
    case ERROR_INSUFFICIENT_BUFFER:   return "ERROR_INSUFFICIENT_BUFFER";
    case ERROR_BAD_FORMAT:            return "ERROR_BAD_FORMAT";
    case ERROR_NO_MORE_FILES:         return "ERROR_NO_MORE_FILES";
    case ERROR_HANDLE_EOF:            return "ERROR_HANDLE_EOF";
    case ERROR_CAN_NOT_COMPLETE:      return "ERROR_CAN_NOT_COMPLETE";
    case ERROR_FILE_CORRUPT:          return "ERROR_FILE_CORRUPT";
  }
  return "UNKNOWN";
}

std::string FormatStormError() {
  DWORD code = SErrGetLastError();
  return " (StormError=" + std::to_string(code) + " " + StormErrorName(code) +
         ", errno=" + std::to_string(errno) + " " + strerror(errno) + ")";
}

Napi::Error MakeStormError(Napi::Env env, const std::string& message, uint32_t code) {
  Napi::Error err = Napi::Error::New(env, message);
  err.Set("code", Napi::Number::New(env, (double)code));
  err.Set("codeName", Napi::String::New(env, StormErrorName(code)));
  return err;
}

void ThrowStormError(Napi::Env env, const std::string& message) {
  DWORD code = SErrGetLastError();
  MakeStormError(env, message + FormatStormError(), code).ThrowAsJavaScriptException();
}
