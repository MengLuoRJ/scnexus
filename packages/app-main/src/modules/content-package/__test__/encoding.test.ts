import { test, expect, vi } from 'vitest'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { openSource, stageArchive } from '../source'
import { decodeCcm } from '../parser'

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}
// Stored ZIP entry with a raw GBK filename, no UTF-8 flag and no Unicode extra field.
function legacyZip() {
  const name = Buffer.concat([
    Buffer.from('Maps/'),
    Buffer.from([0xb5, 0xd8, 0xcd, 0xbc]),
    Buffer.from('.SC2Map'),
  ])
  const data = Buffer.from('legacy payload')
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50)
  local.writeUInt16LE(20, 4)
  local.writeUInt32LE(crc32(data), 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt32LE(crc32(data), 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(name.length, 28)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12)
  end.writeUInt32LE(local.length + name.length + data.length, 16)
  return Buffer.concat([local, name, data, central, name, end])
}

test('legacy non-UTF8 ZIP names remain consistent between 7z listing and reading', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.scnexus-encoding-'))
  try {
    const archive = join(directory, 'legacy.zip')
    await writeFile(archive, legacyZip())
    const source = await openSource({ kind: 'archive', path: archive })
    expect(source.entries).toHaveLength(1)
    expect(source.entries[0].path).not.toContain('\ufffd')
    expect(() => source.read(source.entries[0].path)).toThrow('')
    const staged = await stageArchive(
      source,
      [source.entries[0].path],
      join(directory, 'extracted'),
      new AbortController().signal,
      () => {},
    )
    expect((await readFile(staged.get(source.entries[0].path)!)).toString()).toBe('legacy payload')
    if (process.platform === 'win32') expect(source.entries[0].path).toBe('Maps/地图.SC2Map')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
test('CCM text encoding is independent of archive filename encoding', () => {
  const utf8 = decodeCcm(Buffer.from('title=地图\ncampaign=WOL'))
  expect(utf8.encoding).toBe('utf-8')
  const gbk = decodeCcm(
    Buffer.concat([
      Buffer.from('title='),
      Buffer.from([0xb5, 0xd8, 0xcd, 0xbc]),
      Buffer.from('\ncampaign=WOL'),
    ]),
  )
  expect(gbk.encoding).toBe('gb18030')
  expect(gbk.text).toBe('title=地图\ncampaign=WOL')
})
