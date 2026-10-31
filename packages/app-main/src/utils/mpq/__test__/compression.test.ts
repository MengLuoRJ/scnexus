import { describe, expect, it } from 'vitest'
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
  it('rejects corrupt BZIP2 and unsupported combinations', () => {
    expect(() => decompressMpqSector(bzip.subarray(0, 12), 300)).toThrow('BZIP2')
    const combined = Buffer.from(bzip)
    combined[0] = 0x12
    expect(() => decompressMpqSector(combined, 300)).toThrow('Unsupported MPQ compression')
  })
})
