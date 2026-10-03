# Native package maintenance

## API layers

The main entries of node-stormlib and node-casclib serialize requests through
one Worker per archive/storage. Close drains queued work. A Worker is not
process crash isolation. Prefer these entries for application code.

The compat and bindings entries use separate native modules. Raw methods keep
the exact upstream SFile/Casc names; helpers use camelCase. Compat translates
native errors into structured errors. Add a method in the C++ implementation,
raw TypeScript interface, compat wrapper and the existing package test file.
Do not assume main-entry safety policies apply to compat.

## Ownership and concurrency

Files retain their owning archive/storage. Nested and borrowed MPQ archives
retain their source archive. Close files and nested/borrowed views before the
owning archive/storage. Parent close rejects while children remain open.
Finish releases ownership for a written MPQ file.

Compat async calls run on libuv threads. An in-flight operation rejects other
operations on its handle and related parent/child handles. Await completion
before seek, another read, mutation or close. Busy state is cleared on success
and failure. Constructor references are not environment-local: do not load the
reference native module into multiple Node Workers.

## Reading and integers

Compat read accepts an integer from 0 through 256 MiB. Zero returns an empty
Buffer. EOF short reads return the bytes actually read. readAll/readAllAsync
read from the current cursor to EOF and reject remaining sizes above 256 MiB;
use incremental reads for larger files. Length calculations use 64-bit size and
position APIs. Allocation failures become JavaScript errors.

CASC key names accept nonnegative safe number or uint64 bigint. CASC 64-bit
size/position/full-file-info values return number when safe and bigint otherwise.
setPosition64 accepts safe number or signed int64 bigint. Legacy 32-bit methods
and enumeration structures retain their original contracts. Reference disk
paths are ANSI on Windows; use the main entry for Unicode paths.

## Reproducible builds

Each package pins its upstream commit in scripts/prepare-native.mjs. Builds
fetch upstream independently; stormlib-reference is not a build/runtime input.
Optional STORMLIB_SOURCE_DIR/CASCLIB_SOURCE_DIR must point to a clean upstream
checkout at the pinned commit. Keep MIT reference LICENSE/ORIGIN and copied
upstream license texts when removing the reference checkout.

Use node-gyp/binding.gyp, node-addon-api 8.9.2 and NAPI_VERSION=8. Explicit build
runs source preparation first; gypfile:false suppresses implicit install builds.
Node 26 satisfies the pinned node-gyp build requirement; runtime supports Node
20+. Build each OS/architecture separately; native binaries are not portable.

On macOS StormLib selects system zlib/bzip2: exclude bundled compression sources
and link -lz/-lbz2 for both targets. CascLib retains bundled zlib; do not define
Z_SOLO, and retain its stdio.h preinclude on macOS. Compile the real CascLib
Overwatch implementation, not the reference stub.

## Verification and release gates

The native CI matrix builds and tests both packages on Windows, Linux and macOS,
each with x64 and arm64. Offline MPQ and BLTE fixtures belong in existing test
files. Test EOF, seek, invalid lengths, pending-operation conflicts, failed async
open recovery, independent handles and owner retention. Real CASC integration
requires CASCLIB_TEST_STORAGE (and optionally CASCLIB_TEST_PRODUCT).

Before release, test Node and the supported Electron runtime, actual SC2 MPQ
and installed CASC content, clean upstream download builds and packaged-app
loading. Verify npm pack includes both native modules, dist declarations and
licenses. Publishing prebuilt binaries is not implemented: require a complete
six-platform artifact matrix, package/version consistency, dry-run and provenance
before introducing automated publishing. Do not copy upstream release secrets
or project-specific agent instructions.

This document adapts the naming, platform and verification guidance from the
MIT jamiephan/casclib-stormlib-monorepo reference at commit
9afb1fb34be82d58d1483a0242a3a93a1b1a2838. Its ownership claims are supplemented
by the enforced contracts above; reference documentation is not proof of safety.
