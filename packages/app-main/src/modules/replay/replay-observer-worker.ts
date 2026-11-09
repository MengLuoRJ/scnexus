import { parentPort, workerData } from 'node:worker_threads'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import { createReplayObserverWindowReader } from './replay-observer'
import { readReplayObserverInput } from './replay-observer-storage'
import type { ReplayObserverDatabaseSource } from './replay-observer-storage'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  ReplayObserverWorkerReply,
  ReplayObserverWorkerRequest,
} from './replay-observer-runner'

let reader: ReturnType<typeof createReplayObserverWindowReader> | undefined
let initializationError: AppErrorDto | undefined
try {
  reader = createReplayObserverWindowReader(
    readReplayObserverInput(workerData.databaseSource as ReplayObserverDatabaseSource),
  )
} catch (error) {
  initializationError = toErrorDto(normalizeError(error))
}
parentPort!.on('message', ({ id, request }: ReplayObserverWorkerRequest) => {
  if (!reader) {
    parentPort!.postMessage({
      id,
      ok: false,
      error: initializationError!,
      fatal: true,
    } satisfies ReplayObserverWorkerReply)
    return
  }
  void reader.loadWindow(request).then(
    (data) => parentPort!.postMessage({ id, ok: true, data } satisfies ReplayObserverWorkerReply),
    (error) =>
      parentPort!.postMessage({
        id,
        ok: false,
        error: toErrorDto(normalizeError(error)),
      } satisfies ReplayObserverWorkerReply),
  )
})
