import { createReplayObserver } from './index.js'
import type { ReplayObserver, ReplayObserverState, ReplayObserverTimeline } from './index.js'

export interface ReplayObserverWindow {
  readonly fromGameLoop: number
  readonly toGameLoop: number
  readonly timeline: ReplayObserverTimeline
}

export interface ReplayObserverDataSource {
  readonly durationGameLoops: number
  loadWindow(gameLoop: number, signal: AbortSignal): Promise<ReplayObserverWindow>
}

export interface AsyncReplayObserverState extends ReplayObserverState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error' | 'disposed'
  readonly requestedGameLoop: number | null
  readonly availableRange: Readonly<{ fromGameLoop: number; toGameLoop: number }> | null
  readonly error: Readonly<{
    code: 'load-failed' | 'invalid-window'
    message: string
    sourceCode?: string
  }> | null
}

export interface AsyncReplayObserver {
  getState(): AsyncReplayObserverState
  seek(gameLoop: number): Promise<AsyncReplayObserverState>
  advance(deltaLoops: number): Promise<AsyncReplayObserverState>
  play(): AsyncReplayObserverState
  pause(): AsyncReplayObserverState
  setSpeed(speed: number): AsyncReplayObserverState
  selectUnit(unitTag: string | null): AsyncReplayObserverState
  cancel(): AsyncReplayObserverState
  subscribe(listener: (state: AsyncReplayObserverState) => void): () => void
  dispose(): void
}

class InvalidWindow extends Error {}

function nonnegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be finite and nonnegative`)
}

/** Externally clocked playback over one committed window and a cancellable load. */
export function createAsyncReplayObserver(source: ReplayObserverDataSource): AsyncReplayObserver {
  const duration = source.durationGameLoops
  nonnegative(duration, 'durationGameLoops')
  let state: AsyncReplayObserverState = Object.freeze({
    currentGameLoop: 0,
    duration,
    playing: false,
    speed: 1,
    selectedUnitTag: null,
    selectedUnit: null,
    units: Object.freeze([]),
    status: 'idle',
    requestedGameLoop: null,
    availableRange: null,
    error: null,
  })
  let observer: ReplayObserver | null = null
  let knownTags = new Set<string>()
  let controller: AbortController | null = null
  let generation = 0
  let disposed = false
  const listeners = new Set<(state: AsyncReplayObserverState) => void>()

  function assertActive(): void {
    if (disposed) throw new Error('Async replay observer is disposed')
  }
  function publish(patch: Partial<AsyncReplayObserverState>): AsyncReplayObserverState {
    const next = { ...state, ...patch }
    if ((next.requestedGameLoop ?? next.currentGameLoop) >= duration) next.playing = false
    next.selectedUnit =
      next.selectedUnitTag === null
        ? null
        : (next.units.find((unit) => unit.unitTag === next.selectedUnitTag) ?? null)
    state = Object.freeze(next)
    const published = state
    const pendingListeners = [...listeners]
    for (const listener of pendingListeners) {
      if (disposed) break
      if (listeners.has(listener)) listener(published)
    }
    return state
  }
  function stopLoad(): number {
    const request = ++generation
    const pending = controller
    controller = null
    pending?.abort()
    return request
  }
  function sample(
    gameLoop: number,
    range: NonNullable<AsyncReplayObserverState['availableRange']>,
  ) {
    const sampled = observer!.seek(gameLoop)
    return publish({
      currentGameLoop: sampled.currentGameLoop,
      units: sampled.units,
      status: 'ready',
      requestedGameLoop: null,
      availableRange: range,
      error: null,
    })
  }
  function validateWindow(window: ReplayObserverWindow, gameLoop: number): void {
    const { fromGameLoop: from, toGameLoop: to, timeline } = window
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      from > to ||
      to > duration ||
      gameLoop < from ||
      gameLoop > to ||
      timeline.durationGameLoops !== duration
    )
      throw new InvalidWindow('Loaded window does not cover the requested loop and replay duration')
    for (const unit of timeline.units) {
      if (
        unit.startedGameLoop > to ||
        unit.observations.some((observation) => observation.gameLoop > to)
      )
        throw new InvalidWindow('Loaded window contains observations beyond its boundary')
      if (
        unit.startedGameLoop <= from &&
        (!unit.observations[0] || unit.observations[0].gameLoop > from)
      )
        throw new InvalidWindow('Loaded window is missing cumulative state at its start')
    }
  }

  async function seek(gameLoop: number): Promise<AsyncReplayObserverState> {
    assertActive()
    if (!Number.isFinite(gameLoop)) throw new RangeError('gameLoop must be finite')
    const target = Math.max(0, Math.min(gameLoop, duration))
    const request = stopLoad()
    // Aborting a source may synchronously reenter this manager.
    if (disposed || request !== generation) return state
    const range = state.availableRange
    if (observer && range && target >= range.fromGameLoop && target <= range.toGameLoop)
      return sample(target, range)
    const pending = new AbortController()
    controller = pending
    publish({ status: 'loading', requestedGameLoop: target, error: null })
    if (disposed || request !== generation) return state
    let replacement: ReplayObserver
    let loadedRange: NonNullable<AsyncReplayObserverState['availableRange']>
    let tags: Set<string>
    try {
      const window = await source.loadWindow(target, pending.signal)
      if (disposed || request !== generation) return state
      try {
        validateWindow(window, target)
        replacement = createReplayObserver(window.timeline)
        tags = new Set(window.timeline.units.map((unit) => unit.unitTag))
        loadedRange = Object.freeze({
          fromGameLoop: window.fromGameLoop,
          toGameLoop: window.toGameLoop,
        })
      } catch (error) {
        throw new InvalidWindow(error instanceof Error ? error.message : 'Invalid replay window')
      }
    } catch (error) {
      if (disposed || request !== generation) return state
      controller = null
      return publish({
        status: 'error',
        playing: false,
        requestedGameLoop: null,
        error: Object.freeze({
          code: error instanceof InvalidWindow ? 'invalid-window' : 'load-failed',
          message: error instanceof Error ? error.message : String(error),
          ...(error &&
          typeof error === 'object' &&
          'code' in error &&
          typeof error.code === 'string'
            ? { sourceCode: error.code }
            : {}),
        }),
      })
    }
    controller = null
    observer?.dispose()
    observer = replacement
    knownTags = tags
    return sample(target, loadedRange)
  }

  return {
    getState: () => state,
    seek,
    async advance(deltaLoops) {
      assertActive()
      nonnegative(deltaLoops, 'deltaLoops')
      if (!state.playing || state.status !== 'ready' || deltaLoops === 0) return state
      return seek(Math.min(duration, state.currentGameLoop + deltaLoops * state.speed))
    },
    play() {
      assertActive()
      return publish({ playing: true })
    },
    pause() {
      assertActive()
      return publish({ playing: false })
    },
    setSpeed(speed) {
      assertActive()
      if (!Number.isFinite(speed) || speed <= 0)
        throw new RangeError('speed must be finite and positive')
      return publish({ speed })
    },
    selectUnit(unitTag) {
      assertActive()
      if (unitTag !== null && unitTag !== state.selectedUnitTag && !knownTags.has(unitTag))
        throw new RangeError('Unknown unit tag')
      return publish({ selectedUnitTag: unitTag })
    },
    cancel() {
      assertActive()
      const request = stopLoad()
      if (disposed || request !== generation) return state
      return publish({
        status: state.availableRange ? 'ready' : 'idle',
        requestedGameLoop: null,
        playing: false,
        error: null,
      })
    },
    subscribe(listener) {
      assertActive()
      if (typeof listener !== 'function') throw new TypeError('listener must be a function')
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopLoad()
      observer?.dispose()
      observer = null
      knownTags.clear()
      listeners.clear()
      state = Object.freeze({
        ...state,
        status: 'disposed',
        playing: false,
        requestedGameLoop: null,
        availableRange: null,
        error: null,
      })
    },
  }
}
