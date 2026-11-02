import { openMpq, MpqCompressionError, MpqFormatError } from '../../utils/mpq'
import {
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
  parseReplayGameEvents,
  UnsupportedReplayBuildError,
  UnsupportedReplayProtocolError,
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  type ReplayInitData,
  type ReplayTrackerEvents,
  type ReplayGameEvents,
} from '@scnexus/replay-parser'
import type {
  ReplayAnalysis,
  ReplayJson,
  ReplayRecord,
} from '@scnexus/app-shared/types/replay.type'

import { buildReplayInsights, REPLAY_INSIGHTS_VERSION } from './replay-insights'
import { buildReplayCommands } from './replay-commands'
import { buildReplayCoop, REPLAY_COOP_ANALYSIS_VERSION } from './replay-coop'
export const REPLAY_ANALYSIS_VERSION = `components-${REPLAY_PROTOCOL_ALGORITHM_VERSION}-insights-${REPLAY_INSIGHTS_VERSION}-commands-v1-${REPLAY_COOP_ANALYSIS_VERSION}`

export async function analyzeLocalReplay(record: ReplayRecord): Promise<ReplayAnalysis> {
  if (!record.contentHash) throw new Error('Reindex replay before analysis')
  const result: ReplayAnalysis = {
    replayId: record.id,
    contentHash: record.contentHash,
    parserVersion: REPLAY_ANALYSIS_VERSION,
    baseBuild: record.baseBuild,
    status: 'unsupported',
    components: { initData: null, attributes: null, tracker: null, game: null },
    capabilities: Object.fromEntries(
      ['initData', 'attributes', 'tracker', 'game'].map((key) => [
        key,
        { state: 'missing', decoder: null, sourceBuild: record.baseBuild },
      ]),
    ) as NonNullable<ReplayAnalysis['capabilities']>,
    warnings: [],
    analyzedAt: new Date().toISOString(),
  }
  const archive = await openMpq(record.path, {
    maxHeaderSearchBytes: 1024 * 1024,
    maxMemberBytes: 32 * 1024 * 1024,
  })
  let corrupt = false
  let unsupported = false
  let coopInitData: ReplayInitData | null = null
  let coopTracker: ReplayTrackerEvents | null = null
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
      [
        'game',
        'replay.game.events',
        32 * 1024 * 1024,
        (bytes: Uint8Array) => {
          if (record.baseBuild === null)
            throw new Error('Replay has no baseBuild; reindex a valid replay')
          return parseReplayGameEvents(bytes, record.baseBuild)
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
        if (key === 'initData') coopInitData = data as ReplayInitData
        if (key === 'tracker') coopTracker = data as ReplayTrackerEvents
        result.capabilities![key] = {
          state: 'available',
          decoder: data.protocolVersion,
          sourceBuild: record.baseBuild,
        }
        if (key === 'game') {
          const game = data as ReplayGameEvents
          result.commands = buildReplayCommands(game)
          result.capabilities!.game!.compatibility = game.compatibility
          if (game.compatibility.state === 'unverified') {
            result.capabilities!.game!.state = 'partial'
            result.warnings.push(
              `Unverified game protocol compatibility: source ${record.baseBuild}, decoder ${game.compatibility.protocolBuild}`,
            )
          }
        }
        if (key === 'tracker') {
          const tracker = data as ReplayTrackerEvents
          result.insights = buildReplayInsights(tracker, record.players)
          if (tracker.skippedEvents) result.capabilities!.tracker.state = 'partial'
          result.warnings.push(...tracker.warnings)
        }
      } catch (error) {
        const protocolUnsupported =
          error instanceof UnsupportedReplayBuildError ||
          error instanceof UnsupportedReplayProtocolError
        if ((error as NodeJS.ErrnoException).code && !protocolUnsupported) throw error
        result.capabilities![key]!.state =
          protocolUnsupported || error instanceof MpqCompressionError ? 'unsupported' : 'corrupt'
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
  result.coop = buildReplayCoop(coopInitData, coopTracker)
  const count = Object.values(result.components).filter((value) => value !== null).length
  result.status = corrupt
    ? 'corrupt'
    : count === 4 &&
        Object.values(result.capabilities!).every((capability) => capability.state === 'available')
      ? 'completed'
      : count > 0
        ? 'partial'
        : unsupported
          ? 'unsupported'
          : 'partial'
  return result
}
