# @scnexus/node-casclib

Read-only CascLib bindings using Node-API 8 and a dedicated worker per storage.
The public API returns Promises; native handles never cross worker boundaries.
Requests are serialized and `close()` waits for previously queued operations.
Workers keep synchronous native work off the main thread, but do not isolate
native crashes from the process.

## Build

Requires Node.js, a C++17 compiler, CMake 3.25 or newer and the platform SDK.
The pinned cmake-js build tool requires Node.js 20.17+ or 22.9+; the package
runtime requirement is Node.js 20+. On Windows install Visual Studio C++ tools
and make CMake available on PATH.

```powershell
pnpm --filter @scnexus/node-casclib install
pnpm --filter @scnexus/node-casclib build
pnpm --filter @scnexus/node-casclib test
```

CMake fetches CascLib commit `2a280f5a231966dc5d1b534978dd9f9f04a374cd`
by default. A local checkout can be selected without downloading sources:

```powershell
pnpm --filter @scnexus/node-casclib exec cmake-js compile --CDCASCLIB_SOURCE_DIR=D:/sources/CascLib
pnpm --filter @scnexus/node-casclib build:ts
```

CascLib and its bundled zlib decoder are statically linked. The Node-API
target is kept at version 8, independently of the node-addon-api header version.
Do not distribute a Windows binary as a Linux or macOS binary: build for each
target OS and architecture. No prebuilt downloads or install-time compilation
are configured; consumers must build the native binary explicitly.

## Usage

```typescript
import { Storage, Locale } from "@scnexus/node-casclib";

const storage = await Storage.open("D:/Games/StarCraft II", {
  locale: Locale.ZHCN,
});
try {
  const info = await storage.getInfo();
  const entries = await storage.list({ mask: "*" });
  const tree = await storage.listTree();
  const candidate = entries.find(
    (entry) => entry.available && entry.size < 1024 * 1024,
  );
  if (candidate) {
    const bytes = await storage.readFile(candidate.name, {
      maxBytes: 1024 * 1024,
    });
    await storage.extract(candidate.name, "D:/Exports/file.bin");
  }
} finally {
  await storage.close();
}
```

## API

- `Storage.open(path, options?)`: local installation directory, not an MPQ or a stream.
- `Storage.openOnline(cacheDirectory, { product, region?, locale? })`: explicitly opens a CDN-backed storage; may download manifests and content and take substantial time.
- `Storage.readLocalFile(path, options?)`: decodes one standalone local BLTE file using CascLib. It is not a generic raw-file reader.
- `getInfo()` / `fileCount` / `getFileCount()`: product, build, features, local and total file counts. Counts include unnamed entries and can differ from named enumeration.
- `list({ mask?, listfile? })` / `listTree(options?)`: reads metadata, not file contents. The returned collection is materialized in memory. A listfile can supply otherwise unknown names.
- `hasFile(reference, options?)`: returns false for missing files; other native errors reject.
- `readFile(reference, { maxBytes?, locale?, strict? })`: returns a Buffer, default limit 256 MiB. Only the selected file is decoded; the result crosses the worker boundary as a copy.
- `readTextFile(reference, encoding?, options?)`: defaults to UTF-8.
- `extract(reference, destination, { overwrite?, locale?, strict? })`: writes in 1 MiB chunks through a temporary file. Existing destinations are protected by default; extraction inside the open storage is rejected.
- `addEncryptionKey(name: bigint, key: string)`: uint64 key name and 32 hex characters. Missing keys are not silently replaced by zero-filled data.
- `close()`: idempotent; drains queued work and terminates the worker. New requests after close are rejected.

A file reference is a name, uint32 file data ID, `{ contentKey: "32 hex characters" }`
or `{ encodedKey: "32 hex characters" }`. File IDs and keys depend on the game
and storage capabilities. Unknown names may be synthetic names supplied by
CascLib. Entry `nameType` values are 0 (full name), 1 (data ID), 2 (CKey), 3 (EKey).
Unsupported `fileDataId`, locale or content flags may be `0xffffffff`.

`allowDownload` is off by default for local opens. There are no create, add-file,
delete, rename or save APIs: CASC is not a writable MPQ archive. There is no
operation cancellation or open-progress callback in this wrapper yet.

Native failures become `CascLibError` with a numeric `code`. RangeError and
TypeError retain their type across the worker boundary. This pinned CascLib
revision signals enumeration exhaustion through return values without reliably
setting an error code; an invalid first search handle is treated as an empty list.

## Validation

`npm test` runs real native BLTE raw/zlib decoding, Unicode disk paths, memory
limits, chunked extraction, invalid inputs and closed-handle checks. A separate
real-storage test is opt-in, not a substitute for game-installation fixtures:

```powershell
$env:CASCLIB_TEST_STORAGE = "D:/Games/StarCraft II"
$env:CASCLIB_TEST_PRODUCT = "s2"
pnpm --filter @scnexus/node-casclib test
```

Without that environment variable, real-storage enumeration, CDN access,
encrypted game content and game-specific root formats are not validated.
Linux/macOS builds and packaged Electron execution require separate checks.

## Packaging And Attribution

Publish `dist/`, including `worker.js`, `build/Release/node_casclib.node` and
`dist/licenses/CascLib/`. Electron packaging must keep the native binary outside
ASAR (for example with `asarUnpack`) and preserve the worker's relative paths.
Do not inline the worker into a renderer bundle. The application has not yet
been migrated to this package.

Design reference: `jamiephan/casclib-stormlib-monorepo` and the neighboring
`@scnexus/node-stormlib` package. This wrapper uses its own Promise/worker API,
not the reference package's full low-level API or CLI. CascLib is maintained by
Ladislav Zezula and distributed under MIT; its upstream license and bundled
zlib notices are copied into `dist/licenses/CascLib/` during CMake configuration.
