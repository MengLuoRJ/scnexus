import { parentPort, workerData } from 'node:worker_threads'
import { analyzeLocalReplay } from './replay-analysis'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'

try {
  const result = await analyzeLocalReplay(workerData as ReplayRecord)
  if (Buffer.byteLength(JSON.stringify(result)) > 32 * 1024 * 1024)
    throw new Error('Replay analysis result exceeds 32 MiB limit')
  parentPort!.postMessage({ ok: true, result })
} catch (error) {
  parentPort!.postMessage({
    ok: false,
    message: error instanceof Error ? error.message : String(error),
  })
}
