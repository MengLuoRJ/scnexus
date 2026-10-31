import { deflateSync, inflateSync } from 'node:zlib'
import bunzip from 'seek-bzip'
import { MpqCompressionError, MpqFormatError } from './errors'
import { MPQ_COMPRESSION } from './types'

const SUPPORTED_MASK = MPQ_COMPRESSION.ZLIB | MPQ_COMPRESSION.BZIP2

export function decompressMpqSector(data: Buffer, expectedSize: number): Buffer {
  if (data.length === expectedSize) return Buffer.from(data)
  if (!data.length) return Buffer.alloc(0)

  const compressionMask = data.readUInt8(0)
  const unsupportedMask = compressionMask & ~SUPPORTED_MASK
  if (unsupportedMask !== 0 || compressionMask === SUPPORTED_MASK)
    throw new MpqCompressionError(compressionMask)

  const payload = data.subarray(1)
  let result = payload
  if (compressionMask & MPQ_COMPRESSION.BZIP2) {
    const output = Buffer.alloc(expectedSize)
    let position = 0
    try {
      bunzip.decode(payload, {
        writeByte(value) {
          if (position >= expectedSize) throw new Error('BZIP2 output exceeds sector size')
          output[position++] = value
        },
      })
    } catch (error) {
      throw new MpqFormatError(
        `Invalid BZIP2 MPQ sector: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (position !== expectedSize) throw new MpqFormatError('BZIP2 output size mismatch')
    result = output
  }
  if (compressionMask & MPQ_COMPRESSION.ZLIB)
    result = inflateSync(result, { maxOutputLength: expectedSize })
  if (result.length !== expectedSize) {
    throw new MpqFormatError(
      `Decompressed MPQ sector has ${result.length} bytes; expected ${expectedSize}`,
    )
  }
  return result
}

export function compressMpqSector(data: Buffer): Buffer {
  if (!data.length) return Buffer.alloc(0)
  const compressed = deflateSync(data)
  if (compressed.length + 1 >= data.length) return Buffer.from(data)
  return Buffer.concat([Buffer.from([MPQ_COMPRESSION.ZLIB]), compressed])
}
