import { decryptBlock, MPQ_TABLE_KEYS } from './crypto'
import { MpqFormatError } from './errors'
import type { MpqSource } from './source'

export const MPQ_HEADER_MAGIC = 0x1a51504d
export const MPQ_USER_DATA_MAGIC = 0x1b51504d

export type MpqUserDataHeader = {
  offset: bigint
  size: number
  headerOffset: number
  headerSize: number
}

export type MpqHeader = {
  offset: bigint
  headerSize: number
  archiveSize: bigint
  formatVersion: number
  sectorSizeShift: number
  hashTableOffset: bigint
  blockTableOffset: bigint
  hashTableEntries: number
  blockTableEntries: number
  highBlockTableOffset?: bigint
  hetTableOffset?: bigint
  betTableOffset?: bigint
  userData?: MpqUserDataHeader
}

export type MpqHashEntry = {
  nameHashA: number
  nameHashB: number
  locale: number
  platform: number
  flags: number
  blockIndex: number
}

export type MpqBlockEntry = {
  offset: bigint
  compressedSize: number
  size: number
  flags: number
}

export async function readMpqHeader(
  source: MpqSource,
  maxSearchBytes = 0x08000000,
): Promise<MpqHeader> {
  const sourceSize = await source.size()
  if (sourceSize < 0x20n) throw new MpqFormatError('MPQ source is too small')
  const searchEnd = minBigInt(sourceSize, BigInt(maxSearchBytes))

  for (let offset = 0n; offset + 0x20n <= searchEnd; offset += 0x200n) {
    const prefix = await source.read(offset, 0x10)
    if (prefix.length < 4) break
    const magic = prefix.readUInt32LE(0)

    if (magic === MPQ_USER_DATA_MAGIC && prefix.length >= 0x10) {
      const userData = parseUserDataHeader(prefix, offset)
      const headerOffset = offset + BigInt(userData.headerOffset)
      const header = await tryReadHeader(source, headerOffset, sourceSize)
      if (header) return { ...header, userData }
    }

    if (magic === MPQ_HEADER_MAGIC) {
      const header = await tryReadHeader(source, offset, sourceSize)
      if (header) return header
    }
  }

  throw new MpqFormatError('MPQ header was not found')
}

export async function readClassicTables(
  source: MpqSource,
  header: MpqHeader,
): Promise<{ hashTable: MpqHashEntry[]; blockTable: MpqBlockEntry[] }> {
  if (!header.hashTableEntries || !header.blockTableEntries) {
    if (header.hetTableOffset !== undefined || header.betTableOffset !== undefined) {
      throw new MpqFormatError(
        'HET/BET-only MPQ archives are not supported by the classic table reader',
      )
    }
    throw new MpqFormatError('MPQ archive has no hash or block table')
  }

  const encryptedHashTable = await readExact(
    source,
    header.offset + header.hashTableOffset,
    header.hashTableEntries * 16,
  )
  const encryptedBlockTable = await readExact(
    source,
    header.offset + header.blockTableOffset,
    header.blockTableEntries * 16,
  )
  const hashData = decryptBlock(encryptedHashTable, MPQ_TABLE_KEYS.HASH_TABLE)
  const blockData = decryptBlock(encryptedBlockTable, MPQ_TABLE_KEYS.BLOCK_TABLE)
  const highOffsets = header.highBlockTableOffset
    ? await readHighBlockTable(source, header)
    : undefined

  return {
    hashTable: parseHashTable(hashData, header.hashTableEntries),
    blockTable: parseBlockTable(blockData, header.blockTableEntries, highOffsets),
  }
}

async function tryReadHeader(
  source: MpqSource,
  offset: bigint,
  sourceSize: bigint,
): Promise<MpqHeader | undefined> {
  if (offset + 0x20n > sourceSize) return undefined
  const base = await readExact(source, offset, 0x20)
  if (base.readUInt32LE(0) !== MPQ_HEADER_MAGIC) return undefined
  const headerSize = base.readUInt32LE(4)
  if (![0x20, 0x2c, 0x44, 0xd0].includes(headerSize)) return undefined
  const data = await readExact(source, offset, headerSize)
  const formatVersion = data.readUInt16LE(0x0c)
  if (formatVersion > 3) return undefined

  const hashLow = BigInt(data.readUInt32LE(0x10))
  const blockLow = BigInt(data.readUInt32LE(0x14))
  const hashHigh = headerSize >= 0x2c ? BigInt(data.readUInt16LE(0x28)) : 0n
  const blockHigh = headerSize >= 0x2c ? BigInt(data.readUInt16LE(0x2a)) : 0n
  const archiveSize = headerSize >= 0x44 ? data.readBigUInt64LE(0x2c) : BigInt(data.readUInt32LE(8))

  const header: MpqHeader = {
    offset,
    headerSize,
    archiveSize,
    formatVersion,
    sectorSizeShift: data.readUInt16LE(0x0e),
    hashTableOffset: hashLow | (hashHigh << 32n),
    blockTableOffset: blockLow | (blockHigh << 32n),
    hashTableEntries: data.readUInt32LE(0x18),
    blockTableEntries: data.readUInt32LE(0x1c),
  }

  if (headerSize >= 0x2c) {
    const highBlockOffset = data.readBigUInt64LE(0x20)
    if (highBlockOffset !== 0n) header.highBlockTableOffset = highBlockOffset
  }
  if (headerSize >= 0x44) {
    const betOffset = data.readBigUInt64LE(0x34)
    const hetOffset = data.readBigUInt64LE(0x3c)
    if (betOffset !== 0n) header.betTableOffset = betOffset
    if (hetOffset !== 0n) header.hetTableOffset = hetOffset
  }

  return header
}

function parseUserDataHeader(data: Buffer, offset: bigint): MpqUserDataHeader {
  const size = data.readUInt32LE(4)
  const headerOffset = data.readUInt32LE(8)
  const headerSize = data.readUInt32LE(0x0c)
  if (headerSize > size || size > headerOffset) {
    throw new MpqFormatError('Invalid MPQ user data header')
  }
  return { offset, size, headerOffset, headerSize }
}

function parseHashTable(data: Buffer, count: number): MpqHashEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = index * 16
    return {
      nameHashA: data.readUInt32LE(offset),
      nameHashB: data.readUInt32LE(offset + 4),
      locale: data.readUInt16LE(offset + 8),
      platform: data.readUInt8(offset + 0x0a),
      flags: data.readUInt8(offset + 0x0b),
      blockIndex: data.readUInt32LE(offset + 0x0c),
    }
  })
}

function parseBlockTable(data: Buffer, count: number, highOffsets?: Uint16Array): MpqBlockEntry[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = index * 16
    const lowOffset = BigInt(data.readUInt32LE(offset))
    const highOffset = BigInt(highOffsets?.[index] ?? 0)
    return {
      offset: lowOffset | (highOffset << 32n),
      compressedSize: data.readUInt32LE(offset + 4),
      size: data.readUInt32LE(offset + 8),
      flags: data.readUInt32LE(offset + 0x0c),
    }
  })
}

async function readHighBlockTable(source: MpqSource, header: MpqHeader): Promise<Uint16Array> {
  const data = await readExact(
    source,
    header.offset + header.highBlockTableOffset!,
    header.blockTableEntries * 2,
  )
  return Uint16Array.from({ length: header.blockTableEntries }, (_, index) =>
    data.readUInt16LE(index * 2),
  )
}

async function readExact(source: MpqSource, offset: bigint, length: number): Promise<Buffer> {
  const data = await source.read(offset, length)
  if (data.length !== length) {
    throw new MpqFormatError(
      `Unexpected end of MPQ data at offset ${offset}; expected ${length} bytes, got ${data.length}`,
    )
  }
  return data
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right
}
