#ifndef CASCLIB_ERRORS_H
#define CASCLIB_ERRORS_H

#include <napi.h>
#include <cstdint>
#include <string>

// Human-readable name for a CascLib error code (e.g. ERROR_FILE_NOT_FOUND).
const char* CascErrorName(uint32_t code);

// Legacy suffix string " (CascError=N NAME, errno=...)" appended to messages.
std::string FormatCascError();

// Build a JS Error carrying structured error info:
//   err.code     - numeric CascLib error code
//   err.codeName - symbolic name (e.g. "ERROR_FILE_NOT_FOUND")
Napi::Error MakeCascError(Napi::Env env, const std::string& message, uint32_t code);

// Throw a structured error using the current GetCascError() code.
void ThrowCascError(Napi::Env env, const std::string& message);

#endif
