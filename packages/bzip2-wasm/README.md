# @scnexus/bzip2-wasm

Internal, dependency-free synchronous bzip2 compression/decompression for renderer/Electron workers and Node.js. This package owns its TypeScript and C adapters; it does not depend on or repackage `@digitaldefiance/bzip2-wasm`. That project's documented buffer API and Emscripten approach informed the design; its implementation was not copied. Embedded WASM initializes synchronously and lazily, without fetches, filesystem access, WASI host imports or external assets. Requires standard WebAssembly and `atob`.

## Buffer API

```ts
import { compressBzip2, decompressBzip2 } from '@scnexus/bzip2-wasm'

const compressed = compressBzip2(bytes, { blockSize: 9, maxOutputSize: 1024 * 1024 })
const decoded = decompressBzip2(compressed, bytes.length)
const combined = decompressBzip2(joinedMembers, totalSize, { concatenated: true })
```

- `compressBzip2(input, options?)` accepts empty input and produces a complete member. `blockSize` is an integer **1–9**, the native bzip2 block-size level in units of 100 kB; default **9**. It is not a flush/chunk size.
- `maxOutputSize` is an integer **0–134217728**, default **128 MiB**. Compression can expand input, so the default capacity can reject incompressible 128 MiB input rather than exceed the bound.
- `decompressBzip2(input, expectedSize, options?)` requires nonempty input and an exact integer total output size **0–134217728**. The original two-argument API remains strict: exactly one complete member, no trailing bytes. `{ concatenated: true }` accepts multiple complete members, including empty members; size is checked over all members. Trailing junk is never ignored.
- Input must be `Uint8Array`; subarrays are supported and not modified. Total input and output each remain bounded to **128 MiB**. Output owns its buffer and stays valid after subsequent calls/disposal. Buffer helpers collect chunks and allocate a contiguous result; use streams to avoid retaining entire input/output.

## Incremental API

```ts
import { createBzip2Compressor, createBzip2Decompressor } from '@scnexus/bzip2-wasm'

const compressor = createBzip2Compressor({ blockSize: 1 })
try {
  for (const chunk of inputChunks) {
    for (const output of compressor.write(chunk)) consume(output)
  }
  for (const output of compressor.finish()) consume(output)
} finally {
  compressor.dispose()
}

const decoder = createBzip2Decompressor({ concatenated: true, maxOutputSize: 1024 * 1024 })
// Same write / finish / dispose contract as the compressor.
decoder.dispose()
```

Factories return `Bzip2Stream` with `write(input: Uint8Array): Uint8Array[]`, `finish(): Uint8Array[]`, and `dispose(): void`. The compressor accepts the same options as `compressBzip2`; the decompressor accepts `{ concatenated?: boolean; maxOutputSize?: number }` and does not require an exact output size.

- These are **real libbz2 streaming handles**, not whole-input buffering. Each live stream owns a distinct native `bz_stream`, 64 KiB input/output scratch buffers and libbz2's bounded block/work state. Input is consumed synchronously in steps of at most 64 KiB, not retained between writes. Every returned output chunk is at most 64 KiB; the adapter does not retain emitted output. Native block buffering can delay output until a block/stream completes or the next call; `write()` may return `[]`.
- Limits apply cumulatively across all writes and concatenated members, not independently per chunk/member. Every native step has an explicit output capacity, with at most one sentinel byte beyond the remaining logical limit to distinguish exact completion from overflow. The sentinel is never returned.
- Empty writes are allowed. `finish()` is mandatory: it completes compression, drains pending decompression and checks completion/truncation. An unwritten decompressor is truncated input, whereas a valid compressed empty member succeeds with a zero output limit.
- Upstream libbz2 verifies block/combined CRCs. Output before successful `finish()` is **provisional**: later corruption, truncation, trailing data or capacity failure may invalidate it. Callers requiring atomic validation must stage output themselves.
- Successful `finish()` releases native state. Errors during `write()`/`finish()` also release state and permanently dispose the stream. Writes and repeated `finish()` after closure throw `INVALID_STATE`. `dispose()` is idempotent and aborts without finalizing/checking completeness. Always dispose abandoned streams; active streams are strongly registered until closed.
- Streams can be safely interleaved; disposing/failing one does not affect another. Methods are synchronous; use a worker for large data. No async iterable, flush API, seeking or automatic member recovery is provided.

## Runtime lifecycle and errors

`initBzip2(): void` eagerly initializes the singleton; initialization is otherwise automatic and idempotent. `disposeBzip2(): void` releases the singleton reference, allowing memory to be garbage-collected; the next operation creates a fresh runtime. Disposal is idempotent but **rejects with `ACTIVE_STREAMS` while any stream is active**, leaving streams usable. Finish/dispose them first. Closed streams drop runtime references. WASM linear memory grows up to 512 MiB and its high-water allocation remains until runtime disposal/garbage collection. Live streams share this cap, so allocation can fail below individual input/output limits.

Validation/native/runtime failures use exported `Bzip2Error extends Error`, with a stable `code` (exported `Bzip2ErrorCode` union), readable message and optional `cause`. Invalid arguments now use this error rather than the earlier `RangeError`/`TypeError` classes.

| Code                | Meaning                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`  | Wrong input/options type, noninteger or out-of-range level/size             |
| `INPUT_LIMIT`       | Cumulative input exceeds 128 MiB                                            |
| `OUTPUT_LIMIT`      | Stream/compression output exceeds its capacity                              |
| `SIZE_MISMATCH`     | Buffer decompression output differs from `expectedSize`, including overflow |
| `INVALID_DATA`      | Bad header, corrupt data/CRC or invalid subsequent concatenated member      |
| `TRUNCATED_INPUT`   | No complete member at decompressor finish                                   |
| `TRAILING_DATA`     | Bytes after the first member in strict mode                                 |
| `INVALID_STATE`     | Write/finish after closure                                                  |
| `ACTIVE_STREAMS`    | Runtime disposal attempted with active streams                              |
| `ALLOCATION_FAILED` | Native state/scratch allocation failure                                     |
| `WASM_ERROR`        | Initialization/trap or impossible native progress                           |

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

Toolchain: Emscripten **4.0.23** (compiler revision `7a5d93b50f6a3a35e85a0d2fc9e667b8498e6aed`), Linux/amd64 image `mirror.gcr.io/emscripten/emsdk:4.0.23@sha256:86537645c51e44899812d29820ee3b64b96c321ebb2aba4416a04ceeb1bcde62` pinned in the script. This is the Google mirror of the official Docker Hub `emscripten/emsdk` image. Two fresh-container builds produced the same **61,608-byte** WASM, SHA-256 `f28815c4159a927e11af1c58e430152b548735846bd09677cf23b8f084f7e0a5`. Run `build:wasm` twice and compare the generated hash/file to verify reproducibility. No host-global compiler installation is required. Changes to the compiler/source/flags require regeneration and review of the generated output.

Fixtures are synthetic and contain no game/replay data. Regenerate them with `python scripts/generate-vectors.py` (Python standard-library `bz2`, no dependencies). The 350,000-byte level-1 fixture exercises multiple blocks; the tiny zero-run fixture exercises the 128 MiB output limit and memory growth. Tests also cover CRC errors, every truncated prefix of the text fixture, trailing/concatenated streams, exact-size checks, subarray offsets, invalid bounds, repeated calls and independent outputs.

Streaming tests cover all compression levels, empty input, live bidirectional Python interoperability, incremental boundaries/block emission, capacity, cumulative limits, lifecycle and interleaved handles. Tests require Python 3 (python on PATH).
