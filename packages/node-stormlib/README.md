# @scnexus/node-stormlib

Node-API bindings for StormLib, with one dedicated worker per archive. Native
handles stay inside that worker. Public operations return promises and execute
serially, including stream preparation and close. The worker avoids blocking the
calling event loop; it is not a process-level crash or security boundary.

## Build

Runtime requires Node.js 20+. Building with node-gyp 13.1.0 requires Node.js
22.22.2+, 24.15+ or 26+, Python, Git and a C++17 compiler. On Windows, install
Visual Studio with the Desktop development with C++ workload and a Windows SDK.
The build uses `binding.gyp`, adapted from the reference package. CMake is no
longer used. Dependencies are managed by the workspace. Native compilation is
an explicit build step; use `--ignore-scripts` when installing dependencies
without a prepared native toolchain.

```powershell
git submodule update --init --recursive
pnpm install
pnpm --filter @scnexus/node-stormlib build
pnpm --filter @scnexus/node-stormlib test
```

In this repository, the build validates the StormLib submodule against the
parent Git index and never replaces its source directory. Its initial commit is
`44ebfbfc109d76e2a85bbd5d8b0c949df7e65c6f`. The build statically links bundled
dependencies (system zlib/bzip2 on macOS). Outside this repository, the standalone
package fetches the pinned fallback commit, or accepts a clean local checkout:

```powershell
$env:STORMLIB_SOURCE_DIR = "D:/Sources/StormLib"
pnpm --filter @scnexus/node-stormlib build:native
pnpm --filter @scnexus/node-stormlib build:ts
```

An explicit standalone source override must match the pinned fallback commit
and have no modifications or untracked files. Overrides cannot replace the
registered submodule at `vendor/StormLib`. Update the submodule pointer explicitly
when upgrading upstream, then rebuild and test; also update the standalone
fallback revision in `scripts/prepare-native.mjs` for a release.
Build output includes `build/Release/node_stormlib.node` (Worker binding),
`build/Release/stormlib_bindings.node` (reference binding) and `dist/`.
Upstream license texts are collected into `dist/licenses` during preparation.
This package does not yet publish a platform-specific prebuilt binary matrix.
Build and package separately for each operating system and CPU architecture.

## Usage

```typescript
import { Archive, Compression } from "@scnexus/node-stormlib";

const archive = await Archive.open("example.SC2Map", { writable: true });
try {
  const count = await archive.fileCount;
  const entries = await archive.list();
  const tree = await archive.listTree();
  const script = await archive.readFile("MapScript.galaxy");
  await archive.add(Buffer.from("text"), {
    archivePath: "example.txt",
    compression: Compression.ZLIB,
    encrypt: true,
  });
  await archive.rename("example.txt", "renamed.txt");
  await archive.extract("renamed.txt", "output/renamed.txt");
  await archive.delete("renamed.txt");
  await archive.save();
} finally {
  await archive.close();
}
```

`Archive.create(path, { maxFileCount: 4096 })` exclusively creates a V2 MPQ;
it does not overwrite an existing path. `openMpq` and `createMpq` are aliases.
Open is read-only by default. `getFileCount()` is equivalent to `await fileCount`.
Counts include internal files such as `(listfile)`.

`open` accepts a path or Node.js `Readable`. Stream archives are spooled to a
temporary directory and removed on close. Use `save(newPath)` to export a writable
stream archive before closing. Export destinations must not already exist; this
does not switch the currently open archive to the exported path.

`add` accepts a source path, Buffer or Readable. Buffer/stream inputs require
`archivePath` and are spooled to disk. Use `replace: true` to replace an existing
entry. `readFile` defaults to a 256 MiB per-file limit, configurable with
`{ maxBytes }`; it materializes the entire file and copies bytes across the worker
boundary. Use `extract` for large files. Extraction uses an explicit destination,
does not overwrite by default, and accepts `{ overwrite: true }`.

Mutations update the archive directly through StormLib. `save()` flushes changes;
`close()` may also flush. There is no transaction, rollback or staged editing
contract. For recoverable editing, copy the archive first and edit the copy.
`compact()` compacts the open writable archive. An optional `listfile` path in
open options supplies external names. Unknown names cannot be reconstructed from
hashes; enumeration can include StormLib-generated names.

Native failures expose a numeric code through `StormLibError.code`. Validation
and worker failures use ordinary JavaScript errors. Always await `close()`;
it drains already queued work and rejects new operations. No cancellation API
is provided. Advanced operations are exposed through the separate reference API
below, not through this serialized Worker facade.

## Reference API

The `@scnexus/node-stormlib/compat` entry exports the reference package's
high-level `Archive`, `File`, `StormError`, constants and helpers. The
`@scnexus/node-stormlib/bindings` entry exports `MPQArchiveBinding`,
`MPQFileBinding`, native interfaces and last-error accessors. Low-level methods
retain the exact `SFile...` names. Constants are also available from
`@scnexus/node-stormlib/constants`.

```typescript
import { Archive, MPQ_OPEN_READ_ONLY } from "@scnexus/node-stormlib/compat";

const archive = await Archive.openAsync("example.SC2Map", {
  flags: MPQ_OPEN_READ_ONLY,
});
try {
  const file = archive.openFile("MapScript.galaxy");
  try {
    const bytes = await file.readAllAsync();
  } finally {
    file.close();
  }
} finally {
  archive.close();
}
```

This layer includes raw file handles, seek/read/write/finish, archive capacity,
attributes, checksums, verification/signatures, locales, patch attachment,
embedded archives, arbitrary info classes, listfile and buffer/text helpers.
Its semantics follow the reference package: most calls are synchronous;
`openAsync`, `readAllAsync` and other explicit async variants use libuv workers.
It does not use the main entry's request queue, exclusive creation,
stream input or extraction-overwrite protections. Compat reads are limited to
256 MiB per call; readAll/readAllAsync read the remaining bytes from the cursor.
Use incremental reads for larger files. Pending async operations reject
conflicting operations on related handles. Files and nested/borrowed archives
retain their owner. Close files and nested/borrowed views before their archive;
borrowed handles must not outlive their owner. Locale settings affect the native
module globally. Do not load this reference binding in multiple Node Worker
environments; use the main entry for dedicated Worker isolation.

On Windows the reference binding retains ANSI filesystem-path semantics;
use the main entry for Unicode filesystem paths. Signatures, patch chains,
locale variants and every info class have not received dedicated fixture tests.
The added reference tests exercise file creation/writing, seeking, checksums,
async reopening/reading, missing-file errors and embedded archives, alongside
the original three Worker regression tests. The CLI and prebuilt binary matrix
from the reference project are not included.

## Electron and Distribution

Use the package in the main process, not directly in the renderer. Keep it
external to the main bundle so `dist/worker.js` retains its relative path to the
native module. Ship both `dist` and `build/Release`, including upstream licenses.
If using ASAR, unpack this package and ensure the resolved worker entry points
to the unpacked filesystem path. Verify the packaged application separately.

The addon targets Node-API 8 rather than V8-specific APIs. Local tests exercise
Windows x64; other platforms and packaged Electron applications need their own
build/load tests. Existing application MPQ utilities are not replaced by this
package automatically.

The API and build approach were informed by
[casclib-stormlib-monorepo](https://github.com/jamiephan/casclib-stormlib-monorepo).
The reference native sources and adapted TypeScript wrapper are taken from
commit `9afb1fb34be82d58d1483a0242a3a93a1b1a2838`; the MIT license and provenance
are included in `src/reference`. Local changes include ESM loading and correct
hexadecimal encoding of binary MD5 checksums. The main entry retains its own
Worker binding implementation. Both bindings compile the original
[StormLib](https://github.com/ladislav-zezula/StormLib) source.
