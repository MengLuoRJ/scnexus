import { ipcDesktop, ipcRequest, ipcSnapshot, ipcUnwrap } from './internal/ipc-common'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type {
  ReplayObserverDescriptor,
  ReplayObserverWindowRequest,
  ReplayScope,
} from '@scnexus/app-shared/types/replay.type'
import type { ReplayObserverDataSource } from '@scnexus/sc2-observer'

const replay = () => ipcDesktop().replay
export const ipcReplayWatch = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().watch(ipcSnapshot(scope), id))
export const ipcReplayProfiles = () => ipcRequest(() => replay().profiles())
export const ipcReplayChooseExportPath = () => ipcRequest(() => replay().chooseExportPath())
export const ipcReplayAnalyze = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().analyze(ipcSnapshot(scope), id))
export const ipcReplayGetAnalysis = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().getAnalysis(ipcSnapshot(scope), id))
export const ipcReplayObserverWindow = (
  scope: ReplayScope,
  id: string,
  request: ReplayObserverWindowRequest,
) => ipcRequest(() => replay().observerWindow(ipcSnapshot(scope), id, ipcSnapshot(request)))

/** Serialize window reads; cancellation skips queued requests and ignores in-flight replies. */
export function ipcReplayObserverSource(
  scope: ReplayScope,
  descriptor: ReplayObserverDescriptor,
): ReplayObserverDataSource {
  const currentScope = ipcSnapshot(scope)
  const { replayId, contentHash, parserVersion } = descriptor
  const durationGameLoops = descriptor.history.durationGameLoops
  let queue: Promise<void> = Promise.resolve()
  return {
    durationGameLoops,
    loadWindow(gameLoop, signal) {
      const job = queue.then(async () => {
        signal.throwIfAborted()
        const result = await ipcUnwrap(
          ipcReplayObserverWindow(currentScope, replayId, { contentHash, parserVersion, gameLoop }),
        )
        signal.throwIfAborted()
        if (
          result.replayId !== replayId ||
          result.contentHash !== contentHash ||
          result.parserVersion !== parserVersion
        )
          throw new AppError(ERRORS.REPLAY_OBSERVER_STALE)
        return result
      })
      queue = job.then(
        () => {},
        () => {},
      )
      return job
    },
  }
}
export const ipcReplayListDuplicates = (scope: ReplayScope) =>
  ipcRequest(() => replay().listDuplicates(ipcSnapshot(scope)))
export const ipcReplayExportArchive = (scope: ReplayScope, ids: string[], destination: string) =>
  ipcRequest(() => replay().exportArchive(ipcSnapshot(scope), [...ids], destination))
export const ipcReplayList = (scope: ReplayScope) =>
  ipcRequest(() => replay().list(ipcSnapshot(scope)))
export const ipcReplayScan = (scope: ReplayScope) =>
  ipcRequest(() => replay().scan(ipcSnapshot(scope)))
export const ipcReplayImportFile = (scope: ReplayScope, path: string) =>
  ipcRequest(() => replay().importFile(ipcSnapshot(scope), path))
export const ipcReplayImportArchive = (scope: ReplayScope, path: string) =>
  ipcRequest(() => replay().importArchive(ipcSnapshot(scope), path))
export const ipcReplayDelete = (scope: ReplayScope, id: string) =>
  ipcRequest(() => replay().delete(ipcSnapshot(scope), id))
