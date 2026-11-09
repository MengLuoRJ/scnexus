import { afterEach, expect, test, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import type {
  ReplayApi,
  ReplayObserverDescriptor,
  ReplayObserverWindowData,
} from '@scnexus/app-shared/types/replay.type'
import { ipcReplayObserverSource, ipcReplayObserverWindow } from '../replay'

const scope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' as const }
const descriptor: ReplayObserverDescriptor = {
  replayId: 'id',
  contentHash: 'a'.repeat(64),
  parserVersion: 'test-v1',
  history: {
    version: 1,
    baseBuild: 98310,
    durationGameLoops: 320,
    partial: false,
    diagnostics: [],
    units: [],
  },
}
function reply(loop = 0): ReplayObserverWindowData {
  return {
    replayId: 'id',
    contentHash: descriptor.contentHash,
    parserVersion: descriptor.parserVersion,
    fromGameLoop: loop,
    toGameLoop: Math.min(320, loop + 100),
    timeline: { durationGameLoops: 320, units: [] },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
afterEach(() => vi.unstubAllGlobals())

test('window IPC snapshots scope and request without sending AbortSignal or paths', async () => {
  const result = { ok: true as const, data: reply() }
  const observerWindow = vi.fn<ReplayApi['observerWindow']>().mockResolvedValue(result)
  vi.stubGlobal('scnexus', { replay: { observerWindow } })
  const request = {
    contentHash: descriptor.contentHash,
    parserVersion: descriptor.parserVersion,
    gameLoop: 40.5,
  }
  expect(await ipcReplayObserverWindow(scope, 'id', request)).toBe(result)
  expect(observerWindow).toHaveBeenCalledWith(scope, 'id', request)
  expect(observerWindow.mock.calls[0]![0]).not.toBe(scope)
  expect(observerWindow.mock.calls[0]![2]).not.toBe(request)
})

test('source captures identity and scope rather than observing later mutations', async () => {
  const data = reply()
  const observerWindow = vi.fn<ReplayApi['observerWindow']>().mockResolvedValue({ ok: true, data })
  vi.stubGlobal('scnexus', { replay: { observerWindow } })
  const currentScope = { ...scope }
  const currentDescriptor = { ...descriptor, history: { ...descriptor.history } }
  const source = ipcReplayObserverSource(currentScope, currentDescriptor)
  currentScope.profileHandle = 'changed'
  currentDescriptor.replayId = 'changed'
  currentDescriptor.contentHash = 'b'.repeat(64)
  currentDescriptor.history.durationGameLoops = 10
  expect(source.durationGameLoops).toBe(320)
  expect(await source.loadWindow(40, new AbortController().signal)).toBe(data)
  expect(observerWindow).toHaveBeenCalledWith(scope, 'id', {
    contentHash: descriptor.contentHash,
    parserVersion: descriptor.parserVersion,
    gameLoop: 40,
  })
})

test('serialized reads skip cancelled queued work and discard an aborted in-flight reply', async () => {
  const pending = deferred<IpcResult<ReplayObserverWindowData>>()
  const observerWindow = vi
    .fn<ReplayApi['observerWindow']>()
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ ok: true, data: reply(200) })
  vi.stubGlobal('scnexus', { replay: { observerWindow } })
  const source = ipcReplayObserverSource(scope, descriptor)
  const first = new AbortController()
  const cancelled = new AbortController()
  const previous = source.loadWindow(40, first.signal).catch((error: unknown) => error)
  await flushPromises()
  const middle = source.loadWindow(120, cancelled.signal).catch((error: unknown) => error)
  const latest = source.loadWindow(200, new AbortController().signal)
  first.abort()
  cancelled.abort()
  expect(observerWindow).toHaveBeenCalledOnce()
  pending.resolve({ ok: true, data: reply() })
  expect(await previous).toMatchObject({ name: 'AbortError' })
  expect(await middle).toMatchObject({ name: 'AbortError' })
  expect(await latest).toMatchObject({ fromGameLoop: 200 })
  expect(observerWindow.mock.calls.map((call) => call[2].gameLoop)).toEqual([40, 200])
})

test.each(['replayId', 'contentHash', 'parserVersion'] as const)(
  'source rejects a response with mismatched %s',
  async (field) => {
    const observerWindow = vi
      .fn<ReplayApi['observerWindow']>()
      .mockResolvedValue({ ok: true, data: { ...reply(), [field]: 'wrong' } })
    vi.stubGlobal('scnexus', { replay: { observerWindow } })
    await expect(
      ipcReplayObserverSource(scope, descriptor).loadWindow(0, new AbortController().signal),
    ).rejects.toMatchObject({ code: ERRORS.REPLAY_OBSERVER_STALE.code })
  },
)

test('failed reads preserve the domain failure and do not poison the next queued request', async () => {
  const observerWindow = vi
    .fn<ReplayApi['observerWindow']>()
    .mockResolvedValueOnce({
      ok: false,
      error: toErrorDto(new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)),
    })
    .mockResolvedValueOnce({ ok: true, data: reply() })
  vi.stubGlobal('scnexus', { replay: { observerWindow } })
  const source = ipcReplayObserverSource(scope, descriptor)
  await expect(source.loadWindow(0, new AbortController().signal)).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code,
  })
  expect(await source.loadWindow(0, new AbortController().signal)).toMatchObject({ replayId: 'id' })
})
