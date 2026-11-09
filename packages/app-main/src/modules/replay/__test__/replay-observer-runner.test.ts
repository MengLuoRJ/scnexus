import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import {
  createReplayObserverWorkerReader,
  disposeReplayObserverWorkers,
  REPLAY_OBSERVER_WORKER_MAX_PENDING,
  REPLAY_OBSERVER_WORKER_TIMEOUT_MS,
} from '../replay-observer-runner'
import type { ReplayObserverWorkerRequest } from '../replay-observer-runner'
import type { ReplayObserverInput } from '../replay-observer'

vi.mock('node:fs', () => ({ existsSync: vi.fn<typeof existsSync>() }))
vi.mock('node:worker_threads', () => ({ Worker: vi.fn<typeof Worker>() }))
const input: ReplayObserverInput = {
  replayId: 'replay',
  contentHash: 'a'.repeat(64),
  parserVersion: 'test',
  spatial: {
    version: 1,
    baseBuild: 98310,
    durationGameLoops: 4000,
    partial: false,
    diagnostics: [],
    units: [],
  },
}
const request = {
  contentHash: input.contentHash,
  parserVersion: input.parserVersion,
  gameLoop: 1600.5,
}
function fakeWorker() {
  const worker = Object.assign(new EventEmitter(), {
    postMessage: vi.fn<(message: ReplayObserverWorkerRequest) => void>(),
    terminate: vi.fn<Worker['terminate']>().mockResolvedValue(0),
    ref: vi.fn<() => void>(),
    unref: vi.fn<() => void>(),
  })
  vi.mocked(Worker).mockImplementation(function () {
    return worker as unknown as Worker
  })
  return worker
}
function response(id = 1) {
  return {
    id,
    ok: true,
    data: {
      replayId: input.replayId,
      contentHash: input.contentHash,
      parserVersion: input.parserVersion,
      fromGameLoop: 1600,
      toGameLoop: 3200,
      timeline: { durationGameLoops: 4000, units: [] },
    },
  }
}
beforeEach(() => {
  vi.mocked(existsSync).mockReturnValue(true)
})
afterEach(() => {
  disposeReplayObserverWorkers()
  vi.useRealTimers()
  vi.clearAllMocks()
})

test.each([true, false])(
  'starts the built or source worker with spatial data only (built=%s)',
  async (built) => {
    vi.mocked(existsSync).mockReturnValue(built)
    const worker = fakeWorker()
    const reader = createReplayObserverWorkerReader({
      ...input,
      components: { tracker: 'not-sent' },
    } as ReplayObserverInput)
    const [entry, options] = vi.mocked(Worker).mock.calls[0]!
    expect(options).toMatchObject({
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 256 },
      workerData: { analysis: input },
    })
    expect(options?.workerData.analysis).not.toHaveProperty('components')
    expect(options?.eval).toBe(built ? undefined : true)
    expect(String(entry)).toContain(built ? 'replay-observer-worker.js' : 'tsImport')
    expect(worker.unref).toHaveBeenCalledOnce()
    const pending = reader.loadWindow(request)
    expect(worker.ref).toHaveBeenCalledOnce()
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, request })
    worker.emit('message', response())
    await expect(pending).resolves.toEqual(response().data)
    expect(worker.unref).toHaveBeenCalledTimes(2)
    expect(worker.terminate).not.toHaveBeenCalled()
  },
)

test('correlates out-of-order responses and ignores duplicate or unknown ids', async () => {
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  const first = reader.loadWindow(request)
  const second = reader.loadWindow({ ...request, gameLoop: 1700 })
  worker.emit('message', response(999))
  worker.emit('message', response(2))
  worker.emit('message', response(2))
  worker.emit('message', response(1))
  await expect(Promise.all([first, second])).resolves.toEqual([response().data, response().data])
  expect(worker.terminate).not.toHaveBeenCalled()
})

test.each([
  ERRORS.REPLAY_OBSERVER_STALE,
  ERRORS.REPLAY_OBSERVER_LIMIT,
  ERRORS.IPC_INVALID_ARGUMENT,
])('preserves domain errors without terminating a reusable worker: $code', async (definition) => {
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  const failed = reader.loadWindow(request)
  worker.emit('message', { id: 1, ok: false, error: toErrorDto(new AppError(definition)) })
  await expect(failed).rejects.toMatchObject({ code: definition.code })
  expect(worker.terminate).not.toHaveBeenCalled()
  const next = reader.loadWindow(request)
  worker.emit('message', response(2))
  await expect(next).resolves.toEqual(response().data)
})

test.each(['error', 'messageerror', 'exit', 'malformed', 'postMessage'])(
  'rejects all jobs and releases a failed worker: %s',
  async (kind) => {
    const worker = fakeWorker()
    const reader = createReplayObserverWorkerReader(input)
    if (kind === 'postMessage')
      worker.postMessage.mockImplementationOnce(() => {
        throw new Error('clone failed')
      })
    const first = reader.loadWindow(request)
    const second = reader.loadWindow(request)
    const outcomes = Promise.allSettled([first, second])
    if (kind === 'exit') worker.emit('exit', 0)
    else if (kind === 'malformed')
      worker.emit('message', {
        ...response(),
        data: { ...response().data, contentHash: 'b'.repeat(64) },
      })
    else if (kind !== 'postMessage') worker.emit(kind, new Error('failed'))
    expect((await outcomes).map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(reader.disposed).toBe(true)
    expect(worker.terminate).toHaveBeenCalledOnce()
  },
)

test('times out all requests, ignores late replies and frees the worker slot', async () => {
  vi.useFakeTimers()
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  const pending = reader.loadWindow(request)
  const failure = pending.catch((error: unknown) => error)
  await vi.advanceTimersByTimeAsync(REPLAY_OBSERVER_WORKER_TIMEOUT_MS)
  expect(await failure).toMatchObject({ message: expect.stringContaining('30 second limit') })
  worker.emit('message', response())
  expect(worker.terminate).toHaveBeenCalledOnce()
  expect(reader.disposed).toBe(true)
  const replacement = createReplayObserverWorkerReader(input)
  expect(replacement.disposed).toBe(false)
})

test('bounds pending requests without discarding active work', async () => {
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  const jobs = Array.from({ length: REPLAY_OBSERVER_WORKER_MAX_PENDING }, () =>
    reader.loadWindow(request),
  )
  await expect(reader.loadWindow(request)).rejects.toThrow('busy')
  expect(worker.postMessage).toHaveBeenCalledTimes(REPLAY_OBSERVER_WORKER_MAX_PENDING)
  for (let id = 1; id <= jobs.length; id++) worker.emit('message', response(id))
  await expect(Promise.all(jobs)).resolves.toHaveLength(REPLAY_OBSERVER_WORKER_MAX_PENDING)
})

test('retirement finishes active jobs before terminating once', async () => {
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  const pending = reader.loadWindow(request)
  reader.dispose()
  reader.dispose()
  expect(reader.disposed).toBe(true)
  expect(worker.terminate).not.toHaveBeenCalled()
  await expect(reader.loadWindow(request)).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code,
  })
  worker.emit('message', response())
  await expect(pending).resolves.toEqual(response().data)
  expect(worker.terminate).toHaveBeenCalledOnce()
})

test('shutdown cancels active and retired workers and enforces the live worker limit', async () => {
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  const pending = reader.loadWindow(request)
  const failure = pending.catch((error: unknown) => error)
  reader.dispose()
  createReplayObserverWorkerReader(input)
  expect(() => createReplayObserverWorkerReader(input)).toThrow('At most two')
  disposeReplayObserverWorkers()
  expect(await failure).toMatchObject({ message: expect.stringContaining('application shutdown') })
  expect(worker.terminate).toHaveBeenCalledTimes(2)
  expect(createReplayObserverWorkerReader(input).disposed).toBe(false)
})

test('rejects malformed requests before posting them', async () => {
  const worker = fakeWorker()
  const reader = createReplayObserverWorkerReader(input)
  await expect(reader.loadWindow({ ...request, gameLoop: NaN })).rejects.toMatchObject({
    code: ERRORS.IPC_INVALID_ARGUMENT.code,
  })
  expect(worker.postMessage).not.toHaveBeenCalled()
})
