import { deflateSync, inflateSync } from "node:zlib";
import { MpqCompressionError, MpqFormatError } from "./errors";
import { MPQ_COMPRESSION } from "./types";

const SUPPORTED_MASK = MPQ_COMPRESSION.ZLIB;

export function decompressMpqSector(
  data: Buffer,
  expectedSize: number,
): Buffer {
  if (data.length === expectedSize) return Buffer.from(data);
  if (!data.length) return Buffer.alloc(0);

  const compressionMask = data.readUInt8(0);
  const unsupportedMask = compressionMask & ~SUPPORTED_MASK;
  if (unsupportedMask !== 0) throw new MpqCompressionError(compressionMask);

  const payload = data.subarray(1);
  const result =
    compressionMask & MPQ_COMPRESSION.ZLIB ? inflateSync(payload) : payload;
  if (result.length !== expectedSize) {
    throw new MpqFormatError(
      `Decompressed MPQ sector has ${result.length} bytes; expected ${expectedSize}`,
    );
  }
  return result;
}

export function compressMpqSector(data: Buffer): Buffer {
  if (!data.length) return Buffer.alloc(0);
  const compressed = deflateSync(data);
  if (compressed.length + 1 >= data.length) return Buffer.from(data);
  return Buffer.concat([Buffer.from([MPQ_COMPRESSION.ZLIB]), compressed]);
}