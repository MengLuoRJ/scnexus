import { parentPort, workerData } from 'node:worker_threads'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import { createReplayObserverWindowReader } from './replay-observer'
import type { ReplayObserverInput } from './replay-observer'
import type {
  ReplayObserverWorkerReply,
  ReplayObserverWorkerRequest,
} from './replay-observer-runner'

const reader = createReplayObserverWindowReader(workerData.analysis as ReplayObserverInput)
// The validated source owns a snapshot; release the startup copy.
delete workerData.analysis
parentPort!.on('message', ({ id, request }: ReplayObserverWorkerRequest) => {
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
