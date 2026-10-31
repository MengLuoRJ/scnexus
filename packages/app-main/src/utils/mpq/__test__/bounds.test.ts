import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MpqReader } from '../reader'
import { readClassicTables, type MpqHeader } from '../format'
import type { MpqSource } from '../source'
import { openMpqSource } from '../source'
import { hashString, MPQ_HASH } from '../crypto'

function source(size = 1024n) {
  const read = vi.fn<MpqSource['read']>().mockRejectedValue(new Error('unexpected allocation/read'))
  return { read, size: async () => size } as unknown as MpqSource & { read: typeof read }
}
const header = {
  offset: 0n,
  sectorSizeShift: 3,
  archiveSize: 1024n,
  formatVersion: 0,
  headerSize: 32,
  hashTableOffset: 32n,
  blockTableOffset: 48n,
  hashTableEntries: 1,
  blockTableEntries: 1,
} satisfies MpqHeader

// Exercise automatic listfile loading directly without allocating attacker-controlled buffers.
function reader(input: MpqSource, size: number, compressedSize: number) {
  const name = '(listfile)'
  const hash = {
    nameHashA: hashString(name, MPQ_HASH.NAME_A),
    nameHashB: hashString(name, MPQ_HASH.NAME_B),
    blockIndex: 0,
    locale: 0,
    platform: 0,
    flags: 0,
  }
  const Constructor = MpqReader as unknown as new (...args: unknown[]) => {
    loadNames(): Promise<void>
  }
  return new Constructor(
    input,
    header,
    [hash],
    [{ offset: 64n, size, compressedSize, flags: 0x81000200 }],
  )
}

describe('MPQ pre-allocation bounds', () => {
  it.each([
    [0xffffffff, 0xffffffff],
    [1, 0xffffffff],
    [0xffffffff, 1],
  ])('does not read oversized automatic listfile: %s/%s', async (size, packed) => {
    const input = source()
    await reader(input, size, packed).loadNames()
    expect(input.read).not.toHaveBeenCalled()
  })
  it('rejects member offset/size outside source before reading', async () => {
    const input = source(65n)
    await reader(input, 10, 10).loadNames()
    expect(input.read).not.toHaveBeenCalled()
  })
  it('rejects attacker table counts before reading or allocating', async () => {
    const input = source()
    await expect(
      readClassicTables(input, { ...header, hashTableEntries: 0xffffffff }),
    ).rejects.toThrow('entry limit')
    expect(input.read).not.toHaveBeenCalled()
  })
  it('rejects truncated tables before reading', async () => {
    const input = source(60n)
    await expect(readClassicTables(input, header)).rejects.toThrow('source bounds')
    expect(input.read).not.toHaveBeenCalled()
  })
})

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scnexus-mpq-bounds-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
it('file source refuses oversized reads before Buffer allocation', async () => {
  const path = join(directory, 'small.mpq')
  await writeFile(path, Buffer.alloc(64))
  const input = await openMpqSource(path)
  try {
    await expect(input.read(0n, 0xffffffff)).rejects.toThrow('source bounds')
    await expect(input.read(63n, 2)).rejects.toThrow('source bounds')
    expect(await input.read(60n, 4)).toHaveLength(4)
  } finally {
    await input.close()
  }
})
