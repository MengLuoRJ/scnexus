import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { Worker } from 'node:worker_threads'
import { afterEach, expect, test, vi } from 'vitest'
import type { ReplayAnalysis, ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { disposeReplayAnalyses, runReplayAnalysis } from '../replay-analysis-runner'

vi.mock('node:fs', () => ({ existsSync: vi.fn<typeof existsSync>() }))
vi.mock('node:worker_threads', () => ({ Worker: vi.fn<typeof Worker>() }))

afterEach(() => {
  disposeReplayAnalyses()
  vi.clearAllMocks()
})

test.each([true, false])(
  'passes replay data separately from worker code (built=%s)',
  async (built) => {
    vi.mocked(existsSync).mockReturnValue(built)
    const worker = Object.assign(new EventEmitter(), {
      terminate: vi.fn<Worker['terminate']>().mockResolvedValue(0),
    })
    vi.mocked(Worker).mockImplementation(function () {
      return worker as unknown as Worker
    })
    const record = { id: 'replay', path: 'a"\\b\n${notExecutable}.SC2Replay' } as ReplayRecord
    const pending = runReplayAnalysis(record)
    const [entry, options] = vi.mocked(Worker).mock.calls[0]!
    expect(options).toMatchObject({
      workerData: { record },
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    })
    expect(options?.eval).toBe(built ? undefined : true)
    expect(String(entry)).toBe(
      built
        ? new URL('../replay-analysis-worker.js', import.meta.url).href
        : `const { workerData } = require('node:worker_threads')
import(workerData.loader).then(({ tsImport }) => tsImport(workerData.source, workerData.parentURL))`,
    )
    expect(Object.keys(options?.workerData)).toEqual(
      built ? ['record'] : ['record', 'loader', 'source', 'parentURL'],
    )
    const result = { status: 'partial' } as ReplayAnalysis
    worker.emit('message', { ok: true, result })
    await expect(pending).resolves.toEqual(result)
    expect(worker.terminate).toHaveBeenCalledOnce()
  },
)
