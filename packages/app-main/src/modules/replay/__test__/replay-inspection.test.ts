import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMpq, openMpq } from '../../../utils/mpq'
import { inspectLocalReplay } from '../replay-inspection'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-replay-mpq-'))
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function vint(n: number): number[] {
  const bytes = [(n & 63) * 2]
  n = Math.floor(n / 64)
  while (n) {
    bytes[bytes.length - 1]! |= 128
    bytes.push(n & 127)
    n = Math.floor(n / 128)
  }
  return bytes
}
const int = (n: number) => [9, ...vint(n)]
function blob(value: string): number[] {
  const bytes = Buffer.from(value)
  return [2, ...vint(bytes.length), ...bytes]
}
function struct(fields: Record<number, number[]>): number[] {
  return [
    5,
    ...vint(Object.keys(fields).length),
    ...Object.entries(fields).flatMap(([key, value]) => [...vint(Number(key)), ...value]),
  ]
}
const header = Buffer.from(
  struct({
    0: blob('StarCraft II replay\x1b11'),
    1: struct({ 1: int(5), 2: int(0), 3: int(15), 4: int(98310), 5: int(98310) }),
    3: int(3200),
  }),
)
const details = Buffer.from(
  struct({
    0: [
      0,
      2,
      ...struct({ 0: blob('Player'), 2: blob('Protoss'), 5: int(0), 7: int(0), 8: int(1) }),
    ],
    1: blob('Synthetic map'),
  }),
)

describe('local replay MPQ inspection', () => {
  it('reads genuine MPQ user data and compressed details through the archive adapter', async () => {
    const path = join(directory, 'test.SC2Replay')
    const archive = await createMpq(path, { userData: header })
    await archive.add(details, { archivePath: 'replay.details', compress: true })
    await archive.add(Buffer.from('events not decoded'), { archivePath: 'replay.game.events' })
    await archive.save()
    await archive.close()
    // SC2 stores a 16-byte wrapper, content-length field and padding before the MPQ header.
    const original = await readFile(path)
    const prefix = Buffer.alloc(1024)
    original.copy(prefix, 0, 0, 16 + header.length)
    prefix.writeUInt32LE(512, 4)
    prefix.writeUInt32LE(1024, 8)
    prefix.writeUInt32LE(header.length, 12)
    await writeFile(path, Buffer.concat([prefix, original.subarray(16 + header.length)]))
    const result = await inspectLocalReplay(path)
    expect(result.status).toBe('partial')
    expect(result.supportLevel).toBe('metadata-only')
    expect(result.summary).toMatchObject({
      mapName: 'Synthetic map',
      gameVersion: '5.0.15.98310',
      baseBuild: 98310,
      durationSeconds: 200,
    })
    expect(result.summary.players).toEqual([
      { slot: 1, profileHandle: null, name: 'Player', race: 'Protoss', team: 1, result: 'win' },
    ])
    const reopened = await openMpq(path)
    try {
      expect((await reopened.readUserData())?.subarray(0, header.length)).toEqual(header)
    } finally {
      await reopened.close()
    }
  })
  it('marks arbitrary renamed files corrupt instead of inventing metadata', async () => {
    const path = join(directory, 'invalid.SC2Replay')
    await writeFile(path, 'candidate')
    const result = await inspectLocalReplay(path)
    expect(result.status).toBe('corrupt')
    expect(result.summary.mapName).toBeNull()
    expect(result.summary.players).toEqual([])
  })
  it('marks missing replay header and details corrupt', async () => {
    const path = join(directory, 'empty.SC2Replay')
    const archive = await createMpq(path)
    await archive.close()
    expect((await inspectLocalReplay(path)).status).toBe('corrupt')
  })
  it('propagates filesystem errors instead of treating a missing file as an unsupported build', async () => {
    await expect(inspectLocalReplay(join(directory, 'missing.SC2Replay'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
