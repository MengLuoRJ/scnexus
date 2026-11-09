import { openMpq, MpqCompressionError, MpqFormatError } from '../../utils/mpq'
import {
  buildReplaySpatialTimeline,
  parseReplayAttributes,
  parseReplayInitData,
  parseReplayTrackerEvents,
  parseReplayGameEvents,
  parseReplayMessageEvents,
  UnsupportedReplayBuildError,
  UnsupportedReplayProtocolError,
  REPLAY_PROTOCOL_ALGORITHM_VERSION,
  type ReplayInitData,
  type ReplayAttributes,
  type ReplayTrackerEvents,
  type ReplayGameEvents,
  type ReplayMessageEvents,
} from '@scnexus/replay-parser'
import type {
  ReplayAnalysis,
  ReplayJson,
  ReplayRecord,
} from '@scnexus/app-shared/types/replay.type'

import { buildReplayInsights, REPLAY_INSIGHTS_VERSION } from './replay-insights'
import { isStandardReplayMelee } from './replay-production-scope'
import { buildReplayCommands } from './replay-commands'
import { buildReplayChat } from './replay-chat'
import { buildReplayMetrics, REPLAY_METRICS_VERSION } from './replay-metrics'
import { buildReplayCoop, REPLAY_COOP_ANALYSIS_VERSION } from './replay-coop'
export const REPLAY_ANALYSIS_VERSION = `components-${REPLAY_PROTOCOL_ALGORITHM_VERSION}-insights-${REPLAY_INSIGHTS_VERSION}-commands-v2-chat-v1-spatial-v1-${REPLAY_COOP_ANALYSIS_VERSION}-${REPLAY_METRICS_VERSION}`

export async function analyzeLocalReplay(record: ReplayRecord): Promise<ReplayAnalysis> {
  if (!record.contentHash) throw new Error('Reindex replay before analysis')
  const result: ReplayAnalysis = {
    replayId: record.id,
    contentHash: record.contentHash,
    parserVersion: REPLAY_ANALYSIS_VERSION,
    baseBuild: record.baseBuild,
    status: 'unsupported',
    components: { initData: null, attributes: null, tracker: null, game: null, message: null },
    capabilities: Object.fromEntries(
      ['initData', 'attributes', 'tracker', 'game', 'message'].map((key) => [
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
  let metricsGame: ReplayGameEvents | null = null
  let attributes: ReplayAttributes | null = null
  let messageEvents: ReplayMessageEvents | null = null
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
      [
        'message',
        'replay.message.events',
        4 * 1024 * 1024,
        (bytes: Uint8Array) => {
          if (record.baseBuild === null)
            throw new Error('Replay has no baseBuild; reindex a valid replay')
          return parseReplayMessageEvents(bytes, record.baseBuild)
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
        if (key === 'message') messageEvents = data as ReplayMessageEvents
        if (key === 'attributes') attributes = data as ReplayAttributes
        if (key === 'initData') coopInitData = data as ReplayInitData
        if (key === 'tracker') coopTracker = data as ReplayTrackerEvents
        result.capabilities![key] = {
          state: 'available',
          decoder: data.protocolVersion,
          sourceBuild: record.baseBuild,
        }
        if (key === 'game') {
          const game = data as ReplayGameEvents
          metricsGame = game
        }
        if ('compatibility' in data && data.compatibility) {
          const compatibility = data.compatibility as NonNullable<
            ReplayAnalysis['capabilities']
          >['initData']['compatibility']
          result.capabilities![key]!.compatibility = compatibility
          if (compatibility?.state === 'unverified') {
            result.capabilities![key]!.state = 'partial'
            result.warnings.push(
              `Unverified ${key} protocol compatibility: source ${record.baseBuild}, decoder ${compatibility.protocolBuild}`,
            )
          }
        }
        if (key === 'tracker') {
          const tracker = data as ReplayTrackerEvents
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
  result.chat = buildReplayChat(messageEvents, coopTracker, record.players)
  result.coop = buildReplayCoop(
    result.capabilities!.initData.compatibility?.state === 'unverified' ? null : coopInitData,
    coopTracker,
  )
  if (coopTracker)
    result.insights = buildReplayInsights(coopTracker, record.players, {
      initData: coopInitData,
      gameEvents: metricsGame,
      gameVersion: record.gameVersion,
      playedAt: record.playedAt,
      standardMelee:
        result.capabilities!.initData.compatibility?.state !== 'unverified' &&
        isStandardReplayMelee(coopInitData, attributes, record.players),
    })
  result.metrics = buildReplayMetrics(coopTracker, metricsGame, record.players)
  if (coopTracker) {
    try {
      // Index metadata stores header loops / 16, not Faster-speed wall-clock seconds.
      const durationGameLoops =
        typeof record.durationSeconds === 'number' &&
        Number.isSafeInteger(record.durationSeconds * 16) &&
        record.durationSeconds >= 0
          ? record.durationSeconds * 16
          : undefined
      result.spatial = buildReplaySpatialTimeline(coopTracker, durationGameLoops)
    } catch (error) {
      result.warnings.push(
        `Spatial timeline unavailable: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  if (metricsGame) result.commands = buildReplayCommands(metricsGame, result.spatial)
  const count = Object.values(result.components).filter((value) => value !== null).length
  result.status = corrupt
    ? 'corrupt'
    : count === 5 &&
        Object.values(result.capabilities!).every((capability) => capability.state === 'available')
      ? 'completed'
      : count > 0
        ? 'partial'
        : unsupported
          ? 'unsupported'
          : 'partial'
  return result
}
