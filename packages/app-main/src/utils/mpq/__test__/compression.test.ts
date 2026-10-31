import { describe, expect, it } from 'vitest'
import {
  compressBzip2,
  createBzip2Compressor,
  createBzip2Decompressor,
  decompressBzip2,
  disposeBzip2,
  initBzip2,
} from '@scnexus/bzip2-wasm'
import { decompressMpqSector } from '../compression'

const bzip = Buffer.from(
  '10425a68393141592653598b9daea500003181003800200030cc0529a622e22c45e2ee48a70a121173b5d4a0',
  'hex',
)

describe('bounded replay sector decompression', () => {
  it('decodes BZIP2 sectors used by real tracker streams', () => {
    expect(decompressMpqSector(bzip, 300)).toEqual(Buffer.from('abc'.repeat(100)))
  })
  it('rejects expanded output exceeding expected size', () => {
    expect(() => decompressMpqSector(bzip, 299)).toThrow(/BZIP2/)
    expect(() => decompressMpqSector(bzip, 301)).toThrow(/BZIP2/)
  })
  it('rejects trailing bytes, joined streams and CRC failures instead of accepting partial output', () => {
    expect(() => decompressMpqSector(Buffer.concat([bzip, Buffer.from([0])]), 300)).toThrow('BZIP2')
    expect(() => decompressMpqSector(Buffer.concat([bzip, bzip.subarray(1)]), 600)).toThrow('BZIP2')
    const corrupt = Buffer.from(bzip)
    corrupt[12] = corrupt[12]! ^ 1
    expect(() => decompressMpqSector(corrupt, 300)).toThrow('BZIP2')
    expect(decompressMpqSector(bzip, 300)).toEqual(Buffer.from('abc'.repeat(100)))
  })
  it('keeps MPQ strictly single-stream when codec concatenation support is explicitly enabled elsewhere', () => {
    const source = Buffer.from('SCNexus replay tracker '.repeat(500))
    const encoded = compressBzip2(source, { blockSize: 1 })
    const sector = Buffer.concat([Buffer.from([0x10]), encoded])
    expect(decompressMpqSector(sector, source.length)).toEqual(source)
    const joined = Buffer.concat([encoded, encoded])
    expect(Buffer.from(decompressBzip2(joined, source.length * 2, { concatenated: true }))).toEqual(
      Buffer.concat([source, source]),
    )
    expect(() =>
      decompressMpqSector(Buffer.concat([Buffer.from([0x10]), joined]), source.length * 2),
    ).toThrow('BZIP2')
    disposeBzip2()
    initBzip2()
    expect(decompressMpqSector(sector, source.length)).toEqual(source)
  })
  it('accepts incremental compressor output without changing MPQ format or output ownership', () => {
    const compressor = createBzip2Compressor({ blockSize: 1 })
    const source = Buffer.from('abc'.repeat(3000))
    const compressed = Buffer.concat([
      ...compressor.write(source.subarray(0, 4000)),
      ...compressor.write(source.subarray(4000)),
      ...compressor.finish(),
    ])
    compressor.dispose()
    const sector = Buffer.concat([Buffer.from([0x10]), compressed])
    expect(decompressMpqSector(sector, source.length)).toEqual(source)
    const decoder = createBzip2Decompressor()
    const decoded = Buffer.concat([
      ...decoder.write(compressed.subarray(0, 10)),
      ...decoder.write(compressed.subarray(10)),
      ...decoder.finish(),
    ])
    decoder.dispose()
    expect(decoded).toEqual(source)
  })
  it('rejects corrupt BZIP2 and unsupported combinations', () => {
    expect(() => decompressMpqSector(bzip.subarray(0, 12), 300)).toThrow('BZIP2')
    const combined = Buffer.from(bzip)
    combined[0] = 0x12
    expect(() => decompressMpqSector(combined, 300)).toThrow('Unsupported MPQ compression')
  })
})
