import { openMpq, MpqCompressionError, MpqFormatError } from '../../utils/mpq'
import {
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
  UnsupportedReplayBuildError,
  UnsupportedReplayProtocolError,
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  type ReplayTrackerEvents,
} from '@scnexus/replay-parser'
import type {
  ReplayAnalysis,
  ReplayJson,
  ReplayRecord,
} from '@scnexus/app-shared/types/replay.type'

import { buildReplayInsights, REPLAY_INSIGHTS_VERSION } from './replay-insights'
export const REPLAY_ANALYSIS_VERSION = `components-${REPLAY_PROTOCOL_ALGORITHM_VERSION}-insights-${REPLAY_INSIGHTS_VERSION}`

export async function analyzeLocalReplay(record: ReplayRecord): Promise<ReplayAnalysis> {
  if (!record.contentHash) throw new Error('Reindex replay before analysis')
  const result: ReplayAnalysis = {
    replayId: record.id,
    contentHash: record.contentHash,
    parserVersion: REPLAY_ANALYSIS_VERSION,
    baseBuild: record.baseBuild,
    status: 'unsupported',
    components: { initData: null, attributes: null, tracker: null },
    warnings: [],
    analyzedAt: new Date().toISOString(),
  }
  const archive = await openMpq(record.path)
  let corrupt = false
  let unsupported = false
  try {
    const definitions = [
      [
        'initData',
        'replay.initData',
        4 * 1024 * 1024,
        (bytes: Uint8Array) => {
          if (record.baseBuild === null)
            throw new Error('Replay has no baseBuild; reindex a valid replay')
          return parseReplayInitData(bytes, record.baseBuild)
        },
      ],
      ['attributes', 'replay.attributes.events', 4 * 1024 * 1024, parseReplayAttributes],
      [
        'tracker',
        'replay.tracker.events',
        16 * 1024 * 1024,
        (bytes: Uint8Array) => {
          if (record.baseBuild === null)
            throw new Error('Replay has no baseBuild; reindex a valid replay')
          return parseReplayTrackerEvents(bytes, record.baseBuild)
        },
      ],
    ] as const
    for (const [key, name, maxBytes, parse] of definitions) {
      if (!(await archive.hasFile(name))) {
        result.warnings.push(`Missing ${name}`)
        continue
      }
      try {
        const data = parse(await archive.readFile(name, { maxBytes }))
        result.components[key] = data as ReplayJson
        if (key === 'tracker') {
          const tracker = data as ReplayTrackerEvents
          result.insights = buildReplayInsights(tracker, record.players)
          if (tracker.compatibility)
            result.warnings.push(
              'Tracker-only compatibility profile: baseBuild 98370, reference s2protocol 98310; field tags verified, not an official 98370 schema. initData remains unsupported.',
            )
        }
      } catch (error) {
        const protocolUnsupported =
          error instanceof UnsupportedReplayBuildError ||
          error instanceof UnsupportedReplayProtocolError
        if ((error as NodeJS.ErrnoException).code && !protocolUnsupported) throw error
        unsupported ||= protocolUnsupported || error instanceof MpqCompressionError
        corrupt ||= !(protocolUnsupported || error instanceof MpqCompressionError)
        result.warnings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
      }
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  } catch (error) {
    if (!(error instanceof MpqFormatError)) throw error
    corrupt = true
    result.warnings.push(error.message)
  } finally {
    await archive.close()
  }
  const count = Object.values(result.components).filter((value) => value !== null).length
  result.status = corrupt
    ? 'corrupt'
    : count === 3
      ? 'completed'
      : count > 0
        ? 'partial'
        : unsupported
          ? 'unsupported'
          : 'partial'
  return result
}
