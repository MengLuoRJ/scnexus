# @scnexus/node-stormlib

Node-API bindings for StormLib, with one dedicated worker per archive. Native
handles stay inside that worker. Public operations return promises and execute
serially, including stream preparation and close. The worker avoids blocking the
calling event loop; it is not a process-level crash or security boundary.

## Build

Requirements: Node.js 20+, CMake 3.25+, and a C++17 compiler. On Windows, install
Visual Studio with the Desktop development with C++ workload and a Windows SDK.
Ensure `cmake` is available on PATH. Dependencies are managed by the workspace.

```powershell
pnpm install
pnpm --filter @scnexus/node-stormlib build
pnpm --filter @scnexus/node-stormlib test
```

The build fetches StormLib commit
`44ebfbfc109d76e2a85bbd5d8b0c949df7e65c6f` and statically links its bundled
dependencies. To use the reference checkout without downloading again:

```powershell
pnpm --filter @scnexus/node-stormlib build:native -- --CDSTORMLIB_SOURCE_DIR="D:/Project_SCNexus/scnexus-client/stormlib-reference/thirdparty/StormLib"
pnpm --filter @scnexus/node-stormlib build:ts
```

An explicit source override is trusted and is not checked against the pinned
commit. Build output is `build/Release/node_stormlib.node` and `dist/`.
Upstream license texts are collected into `dist/licenses` during configuration.
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
is provided. Full StormLib coverage (patch attachment, signatures, locale
selection, raw file handles, arbitrary info classes) is not exposed yet.

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
This package uses its own binding implementation and links the original
[StormLib](https://github.com/ladislav-zezula/StormLib) source.