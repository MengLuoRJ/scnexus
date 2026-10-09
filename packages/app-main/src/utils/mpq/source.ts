import { createWriteStream } from 'node:fs'
import { mkdtemp, open, rm, type FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { MpqInput, MpqOpenOptions } from './types'

export interface MpqSource {
  readonly path?: string
  readonly writable: boolean
  size(): Promise<bigint>
  read(offset: bigint, length: number): Promise<Buffer>
  write(offset: bigint, data: Uint8Array): Promise<void>
  truncate(size: bigint): Promise<void>
  close(): Promise<void>
}

class FileMpqSource implements MpqSource {
  readonly path?: string
  readonly writable: boolean
  private readonly handle: FileHandle
  private readonly cleanupDirectory?: string

  constructor(handle: FileHandle, path: string, writable: boolean, cleanupDirectory?: string) {
    this.handle = handle
    this.path = path
    this.writable = writable
    this.cleanupDirectory = cleanupDirectory
  }

  async size(): Promise<bigint> {
    return BigInt((await this.handle.stat()).size)
  }

  async read(offset: bigint, length: number): Promise<Buffer> {
    const position = safePosition(offset)
    const buffer = Buffer.allocUnsafe(length)
    const { bytesRead } = await this.handle.read(buffer, 0, length, position)
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
  }

  async write(offset: bigint, data: Uint8Array): Promise<void> {
    if (!this.writable) throw new Error('MPQ source is read-only')
    const position = safePosition(offset)
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    let written = 0
    while (written < buffer.length) {
      const result = await this.handle.write(
        buffer,
        written,
        buffer.length - written,
        position + written,
      )
      written += result.bytesWritten
    }
  }

  async truncate(size: bigint): Promise<void> {
    if (!this.writable) throw new Error('MPQ source is read-only')
    await this.handle.truncate(safePosition(size))
  }

  async close(): Promise<void> {
    await this.handle.close()
    if (this.cleanupDirectory) {
      await rm(this.cleanupDirectory, { recursive: true, force: true })
    }
  }
}

export async function openMpqSource(
  input: MpqInput,
  options: MpqOpenOptions = {},
): Promise<MpqSource> {
  if (typeof input === 'string') {
    const handle = await open(input, options.writable ? 'r+' : 'r')
    return new FileMpqSource(handle, input, options.writable === true)
  }

  const directory = await mkdtemp(join(options.tempDirectory ?? tmpdir(), 'scnexus-mpq-'))
  const path = join(directory, basename('archive.mpq'))

  try {
    await pipeline(input, createWriteStream(path, { flags: 'wx' }))
    const handle = await open(path, options.writable ? 'r+' : 'r')
    return new FileMpqSource(handle, path, options.writable === true, directory)
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

function safePosition(offset: bigint): number {
  if (offset < 0n || offset > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`MPQ offset is outside the safe Node.js range: ${offset}`)
  }
  return Number(offset)
}
