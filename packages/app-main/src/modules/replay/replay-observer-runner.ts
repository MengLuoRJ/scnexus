import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { AppError, ERRORS, isErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  ReplayObserverWindowData,
  ReplayObserverWindowRequest,
} from '@scnexus/app-shared/types/replay.type'
import { validateReplayObserverWindowRequest } from './replay-observer'
import type { ReplayObserverInput } from './replay-observer'

export type ReplayObserverWorkerRequest = { id: number; request: ReplayObserverWindowRequest }
export type ReplayObserverWorkerReply =
  | { id: number; ok: true; data: ReplayObserverWindowData }
  | { id: number; ok: false; error: AppErrorDto }

export const REPLAY_OBSERVER_WORKER_TIMEOUT_MS = 30_000
export const REPLAY_OBSERVER_WORKER_MAX_PENDING = 8
const active = new Set<() => void>()

export function disposeReplayObserverWorkers(): void {
  for (const cancel of active) cancel()
}

export function createReplayObserverWorkerReader(input: ReplayObserverInput) {
  const { replayId, contentHash, parserVersion, spatial } = input
  if (!spatial) throw new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)
  if (active.size >= 2) throw new Error('At most two replay observer workers can run concurrently')
  const analysis: ReplayObserverInput = { replayId, contentHash, parserVersion, spatial }
  const built = new URL('./replay-observer-worker.js', import.meta.url)
  let worker: Worker
  const options = { execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 256 } }
  if (existsSync(built)) {
    worker = new Worker(built, { ...options, workerData: { analysis } })
  } else {
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href
    const source = new URL('./replay-observer-worker.ts', import.meta.url).href
    worker = new Worker(
      `const { workerData } = require('node:worker_threads')
import(workerData.loader).then(({ tsImport }) => tsImport(workerData.source, workerData.parentURL))`,
      {
        ...options,
        eval: true,
        workerData: { analysis, loader, source, parentURL: import.meta.url },
      },
    )
  }
  const pending = new Map<
    number,
    {
      resolve: (data: ReplayObserverWindowData) => void
      reject: (error: Error) => void
      timeout: ReturnType<typeof setTimeout>
    }
  >()
  let sequence = 0
  let retired = false
  let closed = false
  const stop = (error: Error) => {
    if (closed) return
    closed = true
    active.delete(cancel)
    for (const job of pending.values()) {
      clearTimeout(job.timeout)
      job.reject(error)
    }
    pending.clear()
    void worker.terminate()
  }
  const cancel = () => stop(new Error('Replay observer cancelled during application shutdown'))
  active.add(cancel)
  worker.on('message', (reply: ReplayObserverWorkerReply) => {
    if (closed) return
    const job = pending.get(reply?.id)
    if (!job) return
    if (
      reply.ok === true &&
      reply.data &&
      reply.data.replayId === replayId &&
      reply.data.contentHash === contentHash &&
      reply.data.parserVersion === parserVersion
    ) {
      pending.delete(reply.id)
      clearTimeout(job.timeout)
      job.resolve(reply.data)
    } else if (reply.ok === false && isErrorDto(reply.error)) {
      pending.delete(reply.id)
      clearTimeout(job.timeout)
      job.reject(new AppError(reply.error, { message: reply.error.message }))
    } else {
      stop(new Error('Invalid replay observer worker response'))
      return
    }
    if (!pending.size) {
      worker.unref()
      if (retired) stop(new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE))
    }
  })
  worker.on('error', (error) => stop(error))
  worker.on('messageerror', (error) => stop(error))
  worker.on('exit', (code) => stop(new Error(`Replay observer worker exited (${code})`)))
  worker.unref()
  return {
    get disposed() {
      return retired || closed
    },
    loadWindow(request: ReplayObserverWindowRequest): Promise<ReplayObserverWindowData> {
      try {
        validateReplayObserverWindowRequest(request)
        if (retired || closed) throw new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE)
        if (pending.size >= REPLAY_OBSERVER_WORKER_MAX_PENDING)
          throw new Error('Replay observer worker is busy')
      } catch (error) {
        return Promise.reject(error)
      }
      const id = ++sequence
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => stop(new Error('Replay observer window exceeded 30 second limit')),
          REPLAY_OBSERVER_WORKER_TIMEOUT_MS,
        )
        pending.set(id, { resolve, reject, timeout })
        worker.ref()
        try {
          worker.postMessage({ id, request } satisfies ReplayObserverWorkerRequest)
        } catch (error) {
          stop(error instanceof Error ? error : new Error(String(error)))
        }
      })
    },
    dispose() {
      retired = true
      // Existing projections finish before the worker is evicted; shutdown cancels immediately.
      if (!pending.size) stop(new AppError(ERRORS.REPLAY_OBSERVER_UNAVAILABLE))
    },
  }
}
