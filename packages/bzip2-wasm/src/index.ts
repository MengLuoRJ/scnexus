import { wasmBase64 } from './wasm.generated.js'

const MAX_BYTES = 128 * 1024 * 1024

interface DecoderExports {
  memory: WebAssembly.Memory
  malloc(size: number): number
  free(pointer: number): void
  decode_bzip2(input: number, inputSize: number, output: number, expectedSize: number): number
  _initialize(): void
}

let decoder: DecoderExports | undefined

function getDecoder(): DecoderExports {
  if (!decoder) {
    const bytes = Uint8Array.from(atob(wasmBase64), (character) => character.charCodeAt(0))
    const instance = new WebAssembly.Instance(new WebAssembly.Module(bytes))
    decoder = instance.exports as unknown as DecoderExports
    decoder._initialize()
  }
  return decoder
}

/** Decode exactly one complete bzip2 stream, rejecting trailing bytes and size mismatches. */
export function decompressBzip2(input: Uint8Array, expectedSize: number): Uint8Array {
  if (!(input instanceof Uint8Array)) throw new TypeError('bzip2 input must be a Uint8Array')
  if (input.byteLength === 0 || input.byteLength > MAX_BYTES) {
    throw new RangeError('bzip2 input must contain 1 to 134217728 bytes')
  }
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_BYTES) {
    throw new RangeError('bzip2 expectedSize must be an integer from 0 to 134217728')
  }

  const wasm = getDecoder()
  let inputPointer = 0
  let outputPointer = 0
  try {
    inputPointer = wasm.malloc(input.byteLength)
    outputPointer = wasm.malloc(expectedSize + 1)
    if (!inputPointer || !outputPointer) throw new Error('bzip2 memory allocation failed')
    new Uint8Array(wasm.memory.buffer, inputPointer, input.byteLength).set(input)
    const status = wasm.decode_bzip2(inputPointer, input.byteLength, outputPointer, expectedSize)
    if (status !== 0) {
      const detail =
        status === -100
          ? 'output size mismatch'
          : status === -101
            ? 'trailing bytes or concatenated streams'
            : `invalid, corrupt or truncated stream (libbz2 status ${status})`
      throw new Error(`bzip2 decompression failed: ${detail}`)
    }
    return new Uint8Array(wasm.memory.buffer, outputPointer, expectedSize).slice()
  } finally {
    if (outputPointer) wasm.free(outputPointer)
    if (inputPointer) wasm.free(inputPointer)
  }
}
