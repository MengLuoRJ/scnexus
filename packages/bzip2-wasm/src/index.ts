import { wasmBase64 } from './wasm.generated.js'

const MAX_BYTES = 128 * 1024 * 1024
const CHUNK_BYTES = 64 * 1024

export type Bzip2ErrorCode =
  | 'INVALID_ARGUMENT'
  | 'INPUT_LIMIT'
  | 'OUTPUT_LIMIT'
  | 'SIZE_MISMATCH'
  | 'INVALID_DATA'
  | 'TRUNCATED_INPUT'
  | 'TRAILING_DATA'
  | 'INVALID_STATE'
  | 'ACTIVE_STREAMS'
  | 'ALLOCATION_FAILED'
  | 'WASM_ERROR'

export class Bzip2Error extends Error {
  constructor(
    public readonly code: Bzip2ErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(`bzip2: ${message}`, options)
    this.name = 'Bzip2Error'
  }
}

export interface Bzip2CompressionOptions {
  blockSize?: number
  maxOutputSize?: number
}

export interface Bzip2DecompressionOptions {
  concatenated?: boolean
  maxOutputSize?: number
}

export interface Bzip2Stream {
  write(input: Uint8Array): Uint8Array[]
  finish(): Uint8Array[]
  dispose(): void
}

interface Bzip2Exports {
  memory: WebAssembly.Memory
  malloc(size: number): number
  free(pointer: number): void
  bzip2_create(compress: number, blockSize: number): number
  bzip2_step(
    handle: number,
    input: number,
    inputSize: number,
    output: number,
    outputSize: number,
    finish: number,
  ): number
  bzip2_consumed(handle: number): number
  bzip2_produced(handle: number): number
  bzip2_destroy(handle: number): void
  _initialize(): void
}

let runtime: Bzip2Exports | undefined
const activeStreams = new Set<Bzip2Stream>()

/** Eager initialization is optional; all factories initialize lazily as well. */
export function initBzip2(): void {
  if (runtime) return
  try {
    const bytes = Uint8Array.from(atob(wasmBase64), (character) => character.charCodeAt(0))
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes))
    const exports = instance.exports as unknown as Bzip2Exports
    exports._initialize()
    runtime = exports
  } catch (cause) {
    throw new Bzip2Error('WASM_ERROR', 'initialization failed', { cause })
  }
}

/** Active streams must be finished or disposed before releasing the singleton. */
export function disposeBzip2(): void {
  if (activeStreams.size)
    throw new Bzip2Error('ACTIVE_STREAMS', 'cannot dispose with active streams')
  runtime = undefined
}

function integer(value: number, min: number, max: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Bzip2Error('INVALID_ARGUMENT', `${name} must be an integer from ${min} to ${max}`)
  }
  return value
}

function inputBytes(input: Uint8Array): void {
  if (!(input instanceof Uint8Array))
    throw new Bzip2Error('INVALID_ARGUMENT', 'input must be a Uint8Array')
}

function concatenatedOption(value: boolean | undefined): boolean {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new Bzip2Error('INVALID_ARGUMENT', 'concatenated must be a boolean')
  }
  return value ?? false
}

function createStream(
  compress: boolean,
  blockSize: number,
  maxOutputSize: number,
  concatenated: boolean,
): Bzip2Stream {
  initBzip2()
  let wasm: Bzip2Exports | undefined = runtime
  let handle = 0
  let inputPointer = 0
  let outputPointer = 0
  let state: 'active' | 'finished' | 'disposed' = 'active'
  let inputTotal = 0
  let outputTotal = 0
  let ended = false

  function release(): void {
    if (handle) {
      wasm!.bzip2_destroy(handle)
      handle = 0
    }
    if (inputPointer) {
      wasm!.free(inputPointer)
      inputPointer = 0
    }
    if (outputPointer) {
      wasm!.free(outputPointer)
      outputPointer = 0
    }
    activeStreams.delete(stream)
    wasm = undefined
  }

  function newHandle(): void {
    handle = wasm!.bzip2_create(Number(compress), blockSize)
    if (!handle) throw new Bzip2Error('ALLOCATION_FAILED', 'native stream allocation failed')
  }

  function ensureActive(): void {
    if (state !== 'active') throw new Bzip2Error('INVALID_STATE', `stream is ${state}`)
  }

  function guarded(operation: () => Uint8Array[]): Uint8Array[] {
    ensureActive()
    try {
      return operation()
    } catch (cause) {
      state = 'disposed'
      release()
      if (cause instanceof Bzip2Error) throw cause
      throw new Bzip2Error('WASM_ERROR', 'stream operation failed', { cause })
    }
  }

  function step(
    size: number,
    finish: boolean,
    outputs: Uint8Array[],
  ): { consumed: number; produced: number; status: number } {
    // The sentinel permits CRC/end-marker validation at an exact output limit.
    const capacity = Math.min(CHUNK_BYTES, maxOutputSize - outputTotal + 1)
    const status = wasm!.bzip2_step(
      handle,
      inputPointer,
      size,
      outputPointer,
      capacity,
      Number(finish),
    )
    const consumed = wasm!.bzip2_consumed(handle)
    const produced = wasm!.bzip2_produced(handle)
    if (consumed > size || produced > capacity)
      throw new Bzip2Error('WASM_ERROR', 'invalid native progress')
    if (status < 0) {
      throw new Bzip2Error(
        status === -3 ? 'ALLOCATION_FAILED' : 'INVALID_DATA',
        `invalid or corrupt stream (libbz2 status ${status})`,
      )
    }
    if (produced > maxOutputSize - outputTotal)
      throw new Bzip2Error('OUTPUT_LIMIT', 'output capacity exceeded')
    outputTotal += produced
    if (produced) outputs.push(new Uint8Array(wasm!.memory.buffer, outputPointer, produced).slice())
    return { consumed, produced, status }
  }

  const stream: Bzip2Stream = {
    write(input) {
      return guarded(() => {
        inputBytes(input)
        if (input.byteLength > MAX_BYTES - inputTotal)
          throw new Bzip2Error('INPUT_LIMIT', 'total input exceeds 128 MiB')
        inputTotal += input.byteLength
        const outputs: Uint8Array[] = []
        let offset = 0
        while (offset < input.byteLength) {
          if (ended) {
            if (!concatenated)
              throw new Bzip2Error('TRAILING_DATA', 'trailing bytes or concatenated streams')
            wasm!.bzip2_destroy(handle)
            handle = 0
            newHandle()
            ended = false
          }
          const size = Math.min(CHUNK_BYTES, input.byteLength - offset)
          new Uint8Array(wasm!.memory.buffer, inputPointer, size).set(
            input.subarray(offset, offset + size),
          )
          const result = step(size, false, outputs)
          offset += result.consumed
          if (result.status === 4) {
            ended = true
            continue
          }
          if (!result.consumed && !result.produced)
            throw new Bzip2Error('WASM_ERROR', 'native stream made no progress')
        }
        return outputs
      })
    },
    finish() {
      return guarded(() => {
        const outputs: Uint8Array[] = []
        if (compress) {
          while (!ended) {
            const result = step(0, true, outputs)
            ended = result.status === 4
            if (!ended && !result.produced)
              throw new Bzip2Error('WASM_ERROR', 'native compressor made no progress')
          }
        } else {
          while (!ended) {
            const result = step(0, false, outputs)
            ended = result.status === 4
            if (!ended && !result.produced)
              throw new Bzip2Error('TRUNCATED_INPUT', 'truncated stream')
          }
        }
        state = 'finished'
        release()
        return outputs
      })
    },
    dispose() {
      if (state === 'disposed') return
      state = 'disposed'
      release()
    },
  }

  try {
    newHandle()
    inputPointer = wasm!.malloc(CHUNK_BYTES)
    outputPointer = wasm!.malloc(CHUNK_BYTES)
    if (!inputPointer || !outputPointer)
      throw new Bzip2Error('ALLOCATION_FAILED', 'scratch buffer allocation failed')
    activeStreams.add(stream)
    return stream
  } catch (cause) {
    release()
    if (cause instanceof Bzip2Error) throw cause
    throw new Bzip2Error('WASM_ERROR', 'stream initialization failed', { cause })
  }
}

function validateOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new Bzip2Error('INVALID_ARGUMENT', 'options must be an object')
  }
}

export function createBzip2Compressor(options: Bzip2CompressionOptions = {}): Bzip2Stream {
  validateOptions(options)
  const blockSize = integer(
    options.blockSize === undefined ? 9 : options.blockSize,
    1,
    9,
    'blockSize',
  )
  const limit = integer(
    options.maxOutputSize === undefined ? MAX_BYTES : options.maxOutputSize,
    0,
    MAX_BYTES,
    'maxOutputSize',
  )
  return createStream(true, blockSize, limit, false)
}

export function createBzip2Decompressor(options: Bzip2DecompressionOptions = {}): Bzip2Stream {
  validateOptions(options)
  const limit = integer(
    options.maxOutputSize === undefined ? MAX_BYTES : options.maxOutputSize,
    0,
    MAX_BYTES,
    'maxOutputSize',
  )
  return createStream(false, 0, limit, concatenatedOption(options.concatenated))
}

function collect(stream: Bzip2Stream, input: Uint8Array): Uint8Array {
  try {
    const chunks = [...stream.write(input), ...stream.finish()]
    const output = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0))
    let offset = 0
    for (const chunk of chunks) {
      output.set(chunk, offset)
      offset += chunk.byteLength
    }
    return output
  } catch (cause) {
    if (cause instanceof Bzip2Error) throw cause
    throw new Bzip2Error('ALLOCATION_FAILED', 'output allocation failed', { cause })
  } finally {
    stream.dispose()
  }
}

export function compressBzip2(
  input: Uint8Array,
  options: Bzip2CompressionOptions = {},
): Uint8Array {
  inputBytes(input)
  if (input.byteLength > MAX_BYTES)
    throw new Bzip2Error('INPUT_LIMIT', 'total input exceeds 128 MiB')
  return collect(createBzip2Compressor(options), input)
}

/** Strict single-member decoding by default, with an exact total output size. */
export function decompressBzip2(
  input: Uint8Array,
  expectedSize: number,
  options: Pick<Bzip2DecompressionOptions, 'concatenated'> = {},
): Uint8Array {
  inputBytes(input)
  validateOptions(options)
  integer(expectedSize, 0, MAX_BYTES, 'expectedSize')
  if (!input.byteLength) throw new Bzip2Error('INVALID_ARGUMENT', 'input must be nonempty')
  if (input.byteLength > MAX_BYTES)
    throw new Bzip2Error('INPUT_LIMIT', 'total input exceeds 128 MiB')
  try {
    const output = collect(
      createBzip2Decompressor({ ...options, maxOutputSize: expectedSize }),
      input,
    )
    if (output.byteLength !== expectedSize)
      throw new Bzip2Error('SIZE_MISMATCH', 'output size mismatch')
    return output
  } catch (cause) {
    if (cause instanceof Bzip2Error && cause.code === 'OUTPUT_LIMIT') {
      throw new Bzip2Error('SIZE_MISMATCH', 'output size mismatch', { cause })
    }
    throw cause
  }
}
