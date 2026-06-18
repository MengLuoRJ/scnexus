#ifndef STORMLIB_ERRORS_H
#define STORMLIB_ERRORS_H

#include <napi.h>
#include <cstdint>
#include <string>

// Human-readable name for a StormLib error code (e.g. ERROR_FILE_NOT_FOUND).
const char* StormErrorName(uint32_t code);

// Legacy suffix string " (StormError=N NAME, errno=...)" appended to messages.
std::string FormatStormError();

// Build a JS Error carrying structured error info:
//   err.code     - numeric StormLib error code
//   err.codeName - symbolic name (e.g. "ERROR_FILE_NOT_FOUND")
Napi::Error MakeStormError(Napi::Env env, const std::string& message, uint32_t code);

// Throw a structured error using the current SErrGetLastError() code.
void ThrowStormError(Napi::Env env, const std::string& message);

#endif
