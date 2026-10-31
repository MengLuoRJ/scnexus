import { execFileSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it } from 'vitest'
import {
  Bzip2Error,
  compressBzip2,
  createBzip2Compressor,
  createBzip2Decompressor,
  decompressBzip2,
  disposeBzip2,
  initBzip2,
  type Bzip2ErrorCode,
  type Bzip2Stream,
} from '../src/index.js'

const encoder = new TextEncoder()
const text = encoder.encode('Hello, StarCraft II!\n'.repeat(7))
const join = (chunks: Uint8Array[]) => {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
const randomBytes = (size: number) => {
  let state = 123456789
  return Uint8Array.from({ length: size }, () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state & 255
  })
}
const streams: Bzip2Stream[] = []
const track = (stream: Bzip2Stream) => {
  streams.push(stream)
  return stream
}
const code = (operation: () => unknown, expected: Bzip2ErrorCode) => {
  try {
    operation()
    expect.fail('Expected Bzip2Error')
  } catch (error) {
    expect(error).toBeInstanceOf(Bzip2Error)
    expect(error).toMatchObject({ code: expected })
  }
}

afterEach(() => {
  for (const stream of streams.splice(0)) stream.dispose()
  disposeBzip2()
})

describe('compression and Python interoperability', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    'compresses level %i, including empty input',
    (blockSize) => {
      for (const input of [new Uint8Array(), text, randomBytes(1024)]) {
        const packed = compressBzip2(input, { blockSize })
        expect(packed.subarray(0, 4)).toEqual(encoder.encode(`BZh${blockSize}`))
        expect(decompressBzip2(packed, input.length)).toEqual(input)
        const python = execFileSync(
          'python',
          [
            '-c',
            'import bz2,sys; sys.stdout.buffer.write(bz2.decompress(sys.stdin.buffer.read()))',
          ],
          { input: packed },
        )
        expect(new Uint8Array(python)).toEqual(input)
      }
    },
  )

  it('decodes Python compression at every level', () => {
    const input = randomBytes(350000)
    const result = execFileSync(
      'python',
      [
        '-c',
        'import bz2,sys,json; data=sys.stdin.buffer.read(); print(json.dumps([bz2.compress(data,compresslevel=i).hex() for i in range(1,10)]))',
      ],
      { input, maxBuffer: 8 * 1024 * 1024 },
    )
    const packed: string[] = JSON.parse(result.toString())
    for (const hex of packed)
      expect(decompressBzip2(new Uint8Array(Buffer.from(hex, 'hex')), input.length)).toEqual(input)
  })

  it('validates block sizes and capacities before allocating streams', () => {
    expect.hasAssertions()
    for (const blockSize of [0, 10, -1, 1.5, NaN, Infinity, null]) {
      code(() => compressBzip2(text, { blockSize: blockSize as number }), 'INVALID_ARGUMENT')
    }
    for (const maxOutputSize of [-1, 0.5, NaN, Infinity, 128 * 1024 * 1024 + 1, null]) {
      code(
        () => createBzip2Compressor({ maxOutputSize: maxOutputSize as number }),
        'INVALID_ARGUMENT',
      )
      code(
        () => createBzip2Decompressor({ maxOutputSize: maxOutputSize as number }),
        'INVALID_ARGUMENT',
      )
    }
    code(() => compressBzip2(text, null as never), 'INVALID_ARGUMENT')
    code(() => createBzip2Decompressor({ concatenated: 1 as never }), 'INVALID_ARGUMENT')
    code(() => compressBzip2('text' as never), 'INVALID_ARGUMENT')
  })

  it('honors compression capacity exactly and rejects overflow, including empty input', () => {
    const packed = compressBzip2(text)
    expect(compressBzip2(text, { maxOutputSize: packed.length })).toEqual(packed)
    code(() => compressBzip2(text, { maxOutputSize: packed.length - 1 }), 'OUTPUT_LIMIT')
    code(() => compressBzip2(new Uint8Array(), { maxOutputSize: 0 }), 'OUTPUT_LIMIT')
  })
})

describe('incremental streams', () => {
  it('emits compressed blocks before finish without accumulating input', () => {
    const input = randomBytes(450000)
    const compressor = track(createBzip2Compressor({ blockSize: 1 }))
    const outputs: Uint8Array[] = []
    for (let offset = 0; offset < input.length; offset += 7919) {
      const chunk = input.slice(offset, offset + 7919)
      outputs.push(...compressor.write(chunk))
      chunk.fill(0)
    }
    expect(outputs.length).toBeGreaterThan(0)
    const first = outputs[0].slice()
    outputs.push(...compressor.finish())
    expect(outputs[0]).toEqual(first)
    expect(outputs.every((chunk) => chunk.length <= 65536)).toBe(true)
    expect(decompressBzip2(join(outputs), input.length)).toEqual(input)
  })

  it.each([1, 3, 65535, 65536, 65537])('decompresses split input at %i-byte boundaries', (size) => {
    const input = randomBytes(210000)
    const packed = compressBzip2(input, { blockSize: 1 })
    const decompressor = track(createBzip2Decompressor({ maxOutputSize: input.length }))
    const outputs: Uint8Array[] = []
    for (let offset = 0; offset < packed.length; offset += size)
      outputs.push(...decompressor.write(packed.subarray(offset, offset + size)))
    expect(outputs.length).toBeGreaterThan(0)
    outputs.push(...decompressor.finish())
    expect(outputs.every((chunk) => chunk.length <= 65536)).toBe(true)
    expect(join(outputs)).toEqual(input)
  })

  it('handles empty writes and an empty compressed member', () => {
    const compressor = track(createBzip2Compressor())
    expect(compressor.write(new Uint8Array())).toEqual([])
    const packed = join(compressor.finish())
    const decompressor = track(createBzip2Decompressor({ maxOutputSize: 0 }))
    expect(decompressor.write(new Uint8Array())).toEqual([])
    expect(decompressor.write(packed)).toEqual([])
    expect(decompressor.finish()).toEqual([])
  })

  it('rejects every truncated prefix at finish and releases failed state', () => {
    const packed = compressBzip2(text)
    for (let length = 0; length < packed.length; length++) {
      const stream = track(createBzip2Decompressor())
      stream.write(packed.subarray(0, length))
      code(() => stream.finish(), 'TRUNCATED_INPUT')
      code(() => stream.write(packed), 'INVALID_STATE')
      stream.dispose()
    }
    expect(decompressBzip2(packed, text.length)).toEqual(text)
  })

  it('rejects CRC damage and trailing data across writes', () => {
    expect.hasAssertions()
    const packed = compressBzip2(text)
    for (const offset of [0, 10, packed.length - 2]) {
      const corrupt = packed.slice()
      corrupt[offset] ^= 128
      const stream = track(createBzip2Decompressor())
      code(() => {
        stream.write(corrupt)
        stream.finish()
      }, 'INVALID_DATA')
    }
    const stream = track(createBzip2Decompressor())
    stream.write(packed)
    code(() => stream.write(new Uint8Array([0])), 'TRAILING_DATA')
  })

  it('enforces total output capacity, even across members', () => {
    expect.hasAssertions()
    const packed = compressBzip2(text)
    const stream = track(createBzip2Decompressor({ maxOutputSize: text.length - 1 }))
    code(() => {
      stream.write(packed)
      stream.finish()
    }, 'OUTPUT_LIMIT')
    const concatenated = track(
      createBzip2Decompressor({ concatenated: true, maxOutputSize: text.length }),
    )
    concatenated.write(packed)
    code(() => {
      concatenated.write(packed)
      concatenated.finish()
    }, 'OUTPUT_LIMIT')
  })

  it('enforces 128 MiB total input over multiple writes', () => {
    expect.hasAssertions()
    const compressor = track(createBzip2Compressor({ blockSize: 1 }))
    const chunk = new Uint8Array(1024 * 1024)
    for (let i = 0; i < 128; i++) compressor.write(chunk)
    code(() => compressor.write(new Uint8Array([0])), 'INPUT_LIMIT')
    code(() => compressBzip2(new Uint8Array(128 * 1024 * 1024 + 1)), 'INPUT_LIMIT')
  })
})

describe('concatenation', () => {
  it('is opt-in, checks total expected size, and handles empty members', () => {
    const packed = compressBzip2(text)
    const empty = compressBzip2(new Uint8Array())
    const input = join([empty, packed, empty, packed, empty])
    code(() => decompressBzip2(input, text.length * 2), 'TRAILING_DATA')
    expect(decompressBzip2(input, text.length * 2, { concatenated: true })).toEqual(
      join([text, text]),
    )
    code(() => decompressBzip2(input, text.length, { concatenated: true }), 'SIZE_MISMATCH')
    code(() => decompressBzip2(input, text.length * 2 + 1, { concatenated: true }), 'SIZE_MISMATCH')
  })

  it('handles every split around member boundaries including partial headers', () => {
    const packed = compressBzip2(text)
    const joined = join([packed, packed])
    for (let split = packed.length - 3; split <= packed.length + 5; split++) {
      const stream = track(createBzip2Decompressor({ concatenated: true }))
      expect(
        join([
          ...stream.write(joined.subarray(0, split)),
          ...stream.write(joined.subarray(split)),
          ...stream.finish(),
        ]),
      ).toEqual(join([text, text]))
    }
    const stream = track(createBzip2Decompressor({ concatenated: true }))
    stream.write(packed)
    stream.write(packed.subarray(0, 3))
    code(() => stream.finish(), 'TRUNCATED_INPUT')
    code(
      () =>
        decompressBzip2(join([packed, new Uint8Array([0])]), text.length, { concatenated: true }),
      'INVALID_DATA',
    )
  })
})

describe('lifecycle and isolated native handles', () => {
  it('initializes/disposes idempotently and recreates after disposal', () => {
    disposeBzip2()
    initBzip2()
    initBzip2()
    const packed = compressBzip2(text)
    disposeBzip2()
    disposeBzip2()
    expect(decompressBzip2(packed, text.length)).toEqual(text)
  })

  it('rejects singleton disposal with active streams without invalidating them', () => {
    const compressor = track(createBzip2Compressor())
    code(() => disposeBzip2(), 'ACTIVE_STREAMS')
    const packed = join([...compressor.write(text), ...compressor.finish()])
    disposeBzip2()
    expect(decompressBzip2(packed, text.length)).toEqual(text)
  })

  it('rejects repeated finish and writes after finish/disposal; disposal is idempotent', () => {
    expect.hasAssertions()
    for (const factory of [createBzip2Compressor, createBzip2Decompressor]) {
      const disposed = track(factory())
      disposed.dispose()
      disposed.dispose()
      code(() => disposed.write(text), 'INVALID_STATE')
      code(() => disposed.finish(), 'INVALID_STATE')
    }
    const finished = track(createBzip2Compressor())
    finished.finish()
    code(() => finished.finish(), 'INVALID_STATE')
    code(() => finished.write(text), 'INVALID_STATE')
    finished.dispose()
    finished.dispose()
  })

  it('interleaves compressors/decompressors and keeps outputs independent after failure/free', () => {
    const first = track(createBzip2Compressor({ blockSize: 1 }))
    const second = track(createBzip2Compressor({ blockSize: 9 }))
    first.write(text)
    second.write(text)
    const a = join(first.finish())
    const b = join(second.finish())
    const decoderA = track(createBzip2Decompressor())
    const decoderB = track(createBzip2Decompressor())
    const outputA = decoderA.write(a)
    const outputB = decoderB.write(b.subarray(0, 5))
    decoderA.finish()
    code(() => decoderB.finish(), 'TRUNCATED_INPUT')
    first.dispose()
    expect(outputB).toEqual([])
    expect(join(outputA)).toEqual(text)
    expect(decompressBzip2(b, text.length)).toEqual(text)
    expect(join(outputA)).toEqual(text)
  })
})
