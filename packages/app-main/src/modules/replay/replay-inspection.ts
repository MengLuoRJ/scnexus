import {
  inspectReplayFile,
  REPLAY_COMPONENTS,
  type ReplayInspectionResult,
  type ReplayInspectionInput,
} from '@scnexus/replay-parser'
import { openMpq, MpqCompressionError, MpqFormatError, type MpqArchive } from '../../utils/mpq'

export async function inspectLocalReplay(path: string): Promise<ReplayInspectionResult> {
  let archive: MpqArchive | undefined
  const input: ReplayInspectionInput = { components: {}, availableComponents: [] }
  const warnings: string[] = []
  let corrupt = false
  try {
    archive = await openMpq(path, {
      listfile: REPLAY_COMPONENTS.map((component) => component.name),
      maxHeaderSearchBytes: 1024 * 1024,
      maxMemberBytes: 32 * 1024 * 1024,
    })
    if (archive.info.headerOffset > 1024n * 1024n)
      throw new MpqFormatError('Replay header exceeds 1 MiB limit')
    input.header = await archive.readUserData()
    if (!input.header) {
      corrupt = true
      warnings.push('Replay archive is missing its user-data header.')
    }
    for (const component of REPLAY_COMPONENTS) {
      if (await archive.hasFile(component.name)) input.availableComponents!.push(component.name)
    }
    if (!input.availableComponents!.includes('replay.details')) {
      corrupt = true
      warnings.push('Replay archive is missing replay.details.')
    } else {
      try {
        input.components!['replay.details'] = await archive.readFile('replay.details', {
          maxBytes: 4 * 1024 * 1024,
        })
      } catch (error) {
        if (error instanceof MpqCompressionError) warnings.push(error.message)
        else throw error
      }
    }
  } catch (error) {
    if (error instanceof MpqFormatError || error instanceof RangeError) {
      corrupt = true
      warnings.push(error.message)
    } else if (error instanceof MpqCompressionError) {
      warnings.push(error.message)
    } else {
      throw error
    }
  } finally {
    await archive?.close()
  }
  const result = await inspectReplayFile(path, input)
  if (corrupt) result.status = 'corrupt'
  result.warnings.push(...warnings)
  return result
}
