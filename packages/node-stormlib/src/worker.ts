import { createRequire } from 'node:module'
import { parentPort, workerData } from 'node:worker_threads'

interface NativeArchive {
  call(operation: string, args: unknown[]): unknown
}

const port = parentPort
if (!port) throw new Error('StormLib worker requires a parent port')
const require = createRequire(import.meta.url)
let archive: NativeArchive | undefined

function report(id: number, error: unknown) {
  const failure = error as Error & { code?: number }
  port!.postMessage({
    id,
    error: {
      message: failure.message ?? String(error),
      name: failure.name ?? 'Error',
      code: failure.code,
    },
  })
}

try {
  const binding = require('../build/Release/node_stormlib.node') as {
    Archive: new (path: string, mode: string, capacity: number) => NativeArchive
  }
  archive = new binding.Archive(workerData.path, workerData.mode, workerData.capacity)
  port.postMessage({ id: 0, value: undefined })
} catch (error) {
  report(0, error)
  port.close()
}

if (archive) {
  port.on(
    'message',
    ({ id, operation, args }: { id: number; operation: string; args: unknown[] }) => {
      try {
        const value = archive!.call(operation, args)
        port.postMessage({ id, value })
        if (operation === 'close') port.close()
      } catch (error) {
        report(id, error)
      }
    },
  )
}
