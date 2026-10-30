import { access, open, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { compressMpqSector } from './compression'
import {
  calculateFileKey,
  encryptBlock,
  hashString,
  MPQ_HASH,
  MPQ_HASH_ENTRY_FREE,
  MPQ_TABLE_KEYS,
  normalizeMpqPath,
} from './crypto'
import { MpqFormatError } from './errors'
import { MPQ_FILE_FLAGS, type MpqCreateOptions } from './types'

export type MpqWriteFile = {
  path: string
  data: Buffer
  locale?: number
  platform?: number
  compress?: boolean
  encrypt?: boolean
}

export async function rebuildMpq(
  destination: string,
  names: string[],
  files: AsyncIterable<MpqWriteFile>,
  options: MpqCreateOptions = {},
): Promise<void> {
  const normalizedNames = names.map(normalizeMpqPath)
  if (!normalizedNames.includes('(listfile)')) normalizedNames.push('(listfile)')
  const hashTableSize = normalizeHashTableSize(options.hashTableSize ?? normalizedNames.length * 2)
  const tempPath = join(dirname(destination), `.${randomUUID()}.mpq.tmp`)
  const handle = await open(tempPath, 'wx+')

  try {
    const headerOffset = options.userData ? 0x10 + options.userData.length : 0
    if (options.userData) {
      await writeAll(handle, 0, createUserDataHeader(options.userData.length))
      await writeAll(handle, 0x10, options.userData)
    }
    await writeAll(handle, headerOffset, Buffer.alloc(0x20))

    let position = headerOffset + 0x20
    const blocks: Buffer[] = []
    const hashes = Buffer.alloc(hashTableSize * 16, 0xff)
    let blockIndex = 0
    const seen = new Set<string>()

    for await (const file of appendListfile(files, normalizedNames)) {
      const path = normalizeMpqPath(file.path)
      const folded = path.toUpperCase()
      if (seen.has(folded)) throw new MpqFormatError(`Duplicate MPQ path: ${path}`)
      seen.add(folded)

      const encoded = encodeSingleUnit(
        path,
        file.data,
        position - headerOffset,
        file.compress !== false,
        file.encrypt === true,
      )
      await writeAll(handle, position, encoded.data)
      blocks.push(
        createBlockEntry(
          position - headerOffset,
          encoded.data.length,
          file.data.length,
          encoded.flags,
        ),
      )
      insertHashEntry(hashes, hashTableSize, path, blockIndex, file.locale ?? 0, file.platform ?? 0)
      blockIndex += 1
      position += encoded.data.length
    }

    const blockTable = Buffer.concat(blocks)
    const hashTableOffset = position - headerOffset
    const encryptedHashes = encryptBlock(hashes, MPQ_TABLE_KEYS.HASH_TABLE)
    await writeAll(handle, position, encryptedHashes)
    position += encryptedHashes.length
    const blockTableOffset = position - headerOffset
    const encryptedBlocks = encryptBlock(blockTable, MPQ_TABLE_KEYS.BLOCK_TABLE)
    await writeAll(handle, position, encryptedBlocks)
    position += encryptedBlocks.length

    const header = createHeader({
      archiveSize: position - headerOffset,
      sectorSizeShift: options.sectorSizeShift ?? 5,
      hashTableOffset,
      blockTableOffset,
      hashTableSize,
      blockTableSize: blocks.length,
    })
    await writeAll(handle, headerOffset, header)
    await handle.truncate(position)
    await handle.close()
    await replaceFile(tempPath, destination)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(tempPath, { force: true })
    throw error
  }
}

async function* appendListfile(files: AsyncIterable<MpqWriteFile>, names: string[]) {
  for await (const file of files) {
    if (normalizeMpqPath(file.path).toUpperCase() !== '(LISTFILE)') yield file
  }
  yield {
    path: '(listfile)',
    data: Buffer.from(`${names.join('\r\n')}\r\n`, 'utf8'),
    compress: true,
  } satisfies MpqWriteFile
}

function encodeSingleUnit(
  path: string,
  data: Buffer,
  offset: number,
  compress: boolean,
  encrypt: boolean,
) {
  const compressed = compress ? compressMpqSector(data) : Buffer.from(data)
  const usesCompression = compressed.length < data.length
  let flags = MPQ_FILE_FLAGS.EXISTS | MPQ_FILE_FLAGS.SINGLE_UNIT
  if (usesCompression) flags |= MPQ_FILE_FLAGS.COMPRESS
  let encoded = usesCompression ? compressed : Buffer.from(data)
  if (encrypt) {
    flags |= MPQ_FILE_FLAGS.ENCRYPTED
    encoded = encryptBlock(encoded, calculateFileKey(path, BigInt(offset), data.length, false))
  }
  return { data: encoded, flags }
}

function insertHashEntry(
  table: Buffer,
  tableSize: number,
  path: string,
  blockIndex: number,
  locale: number,
  platform: number,
) {
  const normalized = normalizeMpqPath(path)
  const start = hashString(normalized, MPQ_HASH.TABLE_INDEX) % tableSize
  for (let probe = 0; probe < tableSize; probe += 1) {
    const index = (start + probe) % tableSize
    const offset = index * 16
    if (table.readUInt32LE(offset + 0x0c) === MPQ_HASH_ENTRY_FREE) {
      table.writeUInt32LE(hashString(normalized, MPQ_HASH.NAME_A), offset)
      table.writeUInt32LE(hashString(normalized, MPQ_HASH.NAME_B), offset + 4)
      table.writeUInt16LE(locale & 0xffff, offset + 8)
      table.writeUInt8(platform & 0xff, offset + 0x0a)
      table.writeUInt8(0, offset + 0x0b)
      table.writeUInt32LE(blockIndex, offset + 0x0c)
      return
    }
  }
  throw new MpqFormatError('MPQ hash table is full')
}

function createBlockEntry(offset: number, compressedSize: number, size: number, flags: number) {
  const entry = Buffer.alloc(16)
  entry.writeUInt32LE(offset >>> 0, 0)
  entry.writeUInt32LE(compressedSize >>> 0, 4)
  entry.writeUInt32LE(size >>> 0, 8)
  entry.writeUInt32LE(flags >>> 0, 0x0c)
  return entry
}

function createHeader(options: {
  archiveSize: number
  sectorSizeShift: number
  hashTableOffset: number
  blockTableOffset: number
  hashTableSize: number
  blockTableSize: number
}) {
  const header = Buffer.alloc(0x20)
  header.writeUInt32LE(0x1a51504d, 0)
  header.writeUInt32LE(0x20, 4)
  header.writeUInt32LE(options.archiveSize >>> 0, 8)
  header.writeUInt16LE(0, 0x0c)
  header.writeUInt16LE(options.sectorSizeShift, 0x0e)
  header.writeUInt32LE(options.hashTableOffset >>> 0, 0x10)
  header.writeUInt32LE(options.blockTableOffset >>> 0, 0x14)
  header.writeUInt32LE(options.hashTableSize >>> 0, 0x18)
  header.writeUInt32LE(options.blockTableSize >>> 0, 0x1c)
  return header
}

function createUserDataHeader(size: number) {
  const header = Buffer.alloc(0x10)
  const totalSize = 0x10 + size
  header.writeUInt32LE(0x1b51504d, 0)
  header.writeUInt32LE(totalSize, 4)
  header.writeUInt32LE(totalSize, 8)
  header.writeUInt32LE(size, 0x0c)
  return header
}

function normalizeHashTableSize(requested: number) {
  let size = 4
  while (size < requested) size *= 2
  if (size > 0x80000) throw new RangeError('MPQ hash table is too large')
  return size
}

async function writeAll(
  handle: Awaited<ReturnType<typeof open>>,
  position: number,
  data: Uint8Array,
) {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  let written = 0
  while (written < buffer.length) {
    const result = await handle.write(buffer, written, buffer.length - written, position + written)
    written += result.bytesWritten
  }
}

async function replaceFile(tempPath: string, destination: string) {
  const backupPath = `${destination}.${randomUUID()}.bak`
  const destinationExists = await access(destination).then(
    () => true,
    () => false,
  )

  if (destinationExists) await rename(destination, backupPath)
  try {
    await rename(tempPath, destination)
    if (destinationExists) await rm(backupPath, { force: true })
  } catch (error) {
    if (destinationExists) await rename(backupPath, destination)
    throw error
  }
}
