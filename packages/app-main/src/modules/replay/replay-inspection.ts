import {
  inspectReplayFile,
  parseReplayInitData,
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  REPLAY_COMPONENTS,
  type ReplayInspectionResult,
  type ReplayInspectionInput,
} from '@scnexus/replay-parser'
import type { ReplayCoopSummary } from '@scnexus/app-shared/types/replay-coop.type'
import { identifyReplayCoop } from './replay-coop'
import { openMpq, MpqCompressionError, MpqFormatError, type MpqArchive } from '../../utils/mpq'

export const REPLAY_INSPECTION_VERSION = `inspection-${REPLAY_PROTOCOL_ALGORITHM_VERSION}-coop-v1`
export type LocalReplayInspection = ReplayInspectionResult & { coop: ReplayCoopSummary }

export async function inspectLocalReplay(path: string): Promise<LocalReplayInspection> {
  let archive: MpqArchive | undefined
  const input: ReplayInspectionInput = { components: {}, availableComponents: [] }
  const warnings: string[] = []
  let corrupt = false
  let initData: Uint8Array | undefined
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
    if (input.availableComponents!.includes('replay.initData')) {
      try {
        initData = await archive.readFile('replay.initData', { maxBytes: 4 * 1024 * 1024 })
      } catch (error) {
        if (
          error instanceof MpqCompressionError ||
          error instanceof MpqFormatError ||
          error instanceof RangeError
        )
          warnings.push(`Co-op identification unavailable: ${error.message}`)
        else throw error
      }
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
  let coop = identifyReplayCoop(null)
  if (!corrupt && initData && result.summary.baseBuild !== null) {
    try {
      coop = identifyReplayCoop(parseReplayInitData(initData, result.summary.baseBuild))
    } catch (error) {
      result.warnings.push(
        `Co-op identification unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return { ...result, coop }
}
