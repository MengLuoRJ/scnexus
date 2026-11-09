import { Buffer } from 'node:buffer'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type {
  ReplayAnalysis,
  ReplayAnalysisView,
  ReplayObserverWindowData,
  ReplayObserverWindowRequest,
} from '@scnexus/app-shared/types/replay.type'
import { createReplayObserverTimelineSource } from '@scnexus/sc2-observer'

export const REPLAY_OBSERVER_MAX_OBSERVATIONS = 50_000
export const REPLAY_OBSERVER_MAX_BYTES = 8 * 1024 * 1024

/** IPC view owns its coordinate-free history; the cached analysis remains complete. */
export function replayAnalysisView(analysis: ReplayAnalysis): ReplayAnalysisView {
  const { spatial, components: _components, observer: _observer, ...view } = analysis
  if (!spatial) return view
  return {
    ...view,
    observer: {
      replayId: analysis.replayId,
      contentHash: analysis.contentHash,
      parserVersion: analysis.parserVersion,
      history: {
        ...spatial,
        diagnostics: spatial.diagnostics.map((diagnostic) => ({ ...diagnostic })),
        units: spatial.units.map((unit) => ({
          ...unit,
          observations: unit.observations
            .filter((observation) => observation.kind !== 'position')
            .map((observation) => ({ ...observation, x: null, y: null, positionGameLoop: null })),
        })),
      },
    },
  }
}

export function validateReplayObserverWindowRequest(
  value: unknown,
): asserts value is ReplayObserverWindowRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  const request = value as Record<string, unknown>
  if (
    typeof request.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(request.contentHash) ||
    typeof request.parserVersion !== 'string' ||
    request.parserVersion.length === 0 ||
    request.parserVersion.length > 512 ||
    typeof request.gameLoop !== 'number' ||
    !Number.isFinite(request.gameLoop) ||
    request.gameLoop < 0 ||
    request.gameLoop > Number.MAX_SAFE_INTEGER
  )
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
}

export type ReplayObserverInput = Pick<
  ReplayAnalysis,
  'replayId' | 'contentHash' | 'parserVersion' | 'spatial'
>

export function createReplayObserverWindowReader(analysis: ReplayObserverInput) {
  if (!analysis.spatial) throw new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)
  const { replayId, contentHash, parserVersion } = analysis
  const source = createReplayObserverTimelineSource(analysis.spatial, 1600)
  let active = 0
  let retired = false
  return {
    async loadWindow(request: ReplayObserverWindowRequest): Promise<ReplayObserverWindowData> {
      validateReplayObserverWindowRequest(request)
      if (retired) throw new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)
      if (request.contentHash !== contentHash || request.parserVersion !== parserVersion)
        throw new AppError(ERRORS.REPLAY_OBSERVER_STALE)
      if (request.gameLoop > source.durationGameLoops)
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
      active++
      try {
        const window = await source.loadWindow(request.gameLoop, new AbortController().signal)
        let observations = 0
        for (const unit of window.timeline.units) {
          observations += unit.observations.length
          if (observations > REPLAY_OBSERVER_MAX_OBSERVATIONS)
            throw new AppError(ERRORS.REPLAY_OBSERVER_LIMIT)
        }
        const result: ReplayObserverWindowData = { ...window, replayId, contentHash, parserVersion }
        if (Buffer.byteLength(JSON.stringify(result), 'utf8') > REPLAY_OBSERVER_MAX_BYTES)
          throw new AppError(ERRORS.REPLAY_OBSERVER_LIMIT)
        return result
      } finally {
        active--
        if (retired && active === 0) source.dispose()
      }
    },
    dispose() {
      if (retired) return
      retired = true
      // Eviction must not interrupt a window that is already being projected.
      if (active === 0) source.dispose()
    },
  }
}

export async function replayObserverWindow(
  analysis: ReplayAnalysis,
  request: ReplayObserverWindowRequest,
): Promise<ReplayObserverWindowData> {
  validateReplayObserverWindowRequest(request)
  const reader = createReplayObserverWindowReader(analysis)
  try {
    return await reader.loadWindow(request)
  } finally {
    reader.dispose()
  }
}
