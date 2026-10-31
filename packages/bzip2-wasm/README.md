# @scnexus/bzip2-wasm

Internal, dependency-free synchronous bzip2 decoding for renderer/Electron workers and Node.js. This package owns its TypeScript and C adapters; it does not depend on or repackage `@digitaldefiance/bzip2-wasm`. That project's documented buffer API and Emscripten approach informed the design; its implementation was not copied. Unlike its asynchronous initialization/asset loading API, ours embeds the compiled bytes and lazily creates one synchronous WASM instance.

```ts
import { decompressBzip2 } from '@scnexus/bzip2-wasm'
const decoded = decompressBzip2(compressedBytes, exactUncompressedSize)
```

- `input` must be a nonempty `Uint8Array`, at most 128 MiB; subarrays are supported.
- `expectedSize` must be an integer between zero and 128 MiB, inclusive.
- Exactly one complete stream is required. Trailing bytes and concatenated streams are rejected. Both block and combined CRC checks are performed by libbz2. Bad headers, truncation, corrupt streams and output size mismatches throw.
- A one-byte output sentinel lets libbz2 finish checking the stream even when the expected size is zero or exactly fills the logical output. Decompression cannot write beyond `expectedSize + 1` bytes.
- Returned data owns its buffer. Native buffers and libbz2 state are freed on success and failure. WASM linear memory grows up to 512 MiB and its high-water allocation remains with the lazy instance. Calls are synchronous; use a worker for large archives. Requires standard WebAssembly and `atob` (supported by the project Node/Electron/browser baseline).
- No Node imports, fetches, filesystem access, WASI host imports, asynchronous initialization or external asset URLs occur at runtime. Compression is intentionally not part of the public API.

## Source and license

The unmodified official **libbz2 1.0.8** sources are checked in, extracted, at `native/bzip2-1.0.8/`. The release archive is not retained; builds compile these tracked source files directly.

- Original release source: <https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz>
- Original archive SHA-256 (provenance): `ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269`
- Upstream copyright: Julian R Seward, 1996–2019.
- Full redistribution terms: [`LICENSE.libbz2`](./LICENSE.libbz2), also retained at `native/bzip2-1.0.8/LICENSE`. Distributors must retain this notice/license alongside the bundled application.

`native/decoder.c` is our separate streaming adapter; upstream source files are not patched. The linked Emscripten allocator/libc runtime notices are retained in [`LICENSE.runtime`](./LICENSE.runtime); ship this file alongside `LICENSE.libbz2`.

## Build and verification

Ordinary builds use the checked-in `src/wasm.generated.ts`; Docker/compiler/network access is not needed:

```sh
pnpm --filter @scnexus/bzip2-wasm build
pnpm --filter @scnexus/bzip2-wasm typecheck
pnpm --filter @scnexus/bzip2-wasm test
```

To regenerate WASM, install Docker separately and run:

```sh
pnpm --filter @scnexus/bzip2-wasm build:wasm
```

The script compiles the tracked sources directly from `native/bzip2-1.0.8/`, writes intermediates to the ignored package-local `.build/` directory, mounts **only this package** into the pinned Emscripten container, disables container networking and generates base64 TypeScript. It validates that the module has no host imports and prints the WASM size/hash; the hash is recorded in the generated file. The native build uses `-O3 -flto`, standalone reactor WASM, no stdio/filesystem, `emmalloc`, bounded growing memory and stripped binary symbols. The exact compiler invocation is maintained in `scripts/build-wasm.mjs`.

Toolchain: Emscripten **4.0.23** (compiler revision `7a5d93b50f6a3a35e85a0d2fc9e667b8498e6aed`), Linux/amd64 image `mirror.gcr.io/emscripten/emsdk:4.0.23@sha256:86537645c51e44899812d29820ee3b64b96c321ebb2aba4416a04ceeb1bcde62` pinned in the script. This is the Google mirror of the official Docker Hub `emscripten/emsdk` image. Two fresh-container builds produced the same **26,460-byte** WASM, SHA-256 `7c29c0da5a1a5673a006fcb6dd1ec54a5bf0823ab7136c75c29865259f8f0fce`. Run `build:wasm` twice and compare the generated hash/file to verify reproducibility. No host-global compiler installation is required. Changes to the compiler/source/flags require regeneration and review of the generated output.

Fixtures are synthetic and contain no game/replay data. Regenerate them with `python scripts/generate-vectors.py` (Python standard-library `bz2`, no dependencies). The 350,000-byte level-1 fixture exercises multiple blocks; the tiny zero-run fixture exercises the 128 MiB output limit and memory growth. Tests also cover CRC errors, every truncated prefix of the text fixture, trailing/concatenated streams, exact-size checks, subarray offsets, invalid bounds, repeated calls and independent outputs.
