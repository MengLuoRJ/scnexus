import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import type { ReplayAnalysis, ReplayRecord } from '@scnexus/app-shared/types/replay.type'

const active = new Set<() => void>()
export function disposeReplayAnalyses(): void {
  for (const cancel of active) cancel()
}

/** Parsing/decompression run off the Electron main thread; one bounded worker per explicit request. */
export function runReplayAnalysis(record: ReplayRecord): Promise<ReplayAnalysis> {
  const built = new URL('./replay-analysis-worker.js', import.meta.url)
  let worker: Worker
  if (existsSync(built)) {
    worker = new Worker(built, {
      workerData: record,
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    })
  } else {
    const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href
    const source = new URL('./replay-analysis-worker.ts', import.meta.url).href
    worker = new Worker(
      `import(${JSON.stringify(loader)}).then(({ tsImport }) => tsImport(${JSON.stringify(source)}, ${JSON.stringify(import.meta.url)}))`,
      {
        eval: true,
        workerData: record,
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 256 },
      },
    )
  }
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error?: Error, result?: ReplayAnalysis) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      active.delete(cancel)
      void worker.terminate()
      if (error) reject(error)
      else resolve(result!)
    }
    const cancel = () => finish(new Error('Replay analysis cancelled during application shutdown'))
    active.add(cancel)
    const timeout = setTimeout(
      () => finish(new Error('Replay analysis exceeded 60 second limit')),
      60_000,
    )
    worker.once('message', (reply: { ok: boolean; result?: ReplayAnalysis; message?: string }) => {
      if (reply.ok && reply.result) finish(undefined, reply.result)
      else finish(new Error(reply.message ?? 'Replay analysis worker failed'))
    })
    worker.once('error', (error) => finish(error))
    worker.once('exit', (code) =>
      finish(new Error(`Replay analysis worker exited before returning a result (${code})`)),
    )
  })
}
