import { MpqArchive } from './archive'
import type { MpqInput, MpqOpenOptions } from './types'

export { MpqArchive, createMpq } from './archive'
export * from './errors'
export * from './types'

export function openMpq(input: MpqInput, options: MpqOpenOptions = {}): Promise<MpqArchive> {
  return MpqArchive.open(input, options)
}
