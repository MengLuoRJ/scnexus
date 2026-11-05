import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { ShellBridgeApi } from '@scnexus/app-shared/types/shell.type'
import { ipcRequest, ipcSubscription, ipcSnapshot } from './ipc-common'

type Channel =
  | 'app:is-packaged'
  | 'app:get-locale'
  | 'app:get-system-locale'
  | 'app:get-locale-country-code'
  | 'app:get-preferred-system-languages'
  | 'app:get-path'
  | 'app:get-paths'
  | 'dialog:show-open-dialog'
  | 'dialog:show-open-dialog-sync'
  | keyof ShellBridgeApi
  | 'updater:status'
  | 'updater:check-for-updates'
  | 'updater:check-for-updates-and-notify'
  | 'updater:download-update'
  | 'updater:quit-and-install'
type Event =
  | 'updater:checking-for-update'
  | 'updater:update-available'
  | 'updater:update-not-available'
  | 'updater:download-progress'
  | 'updater:update-downloaded'
  | 'updater:error'
function bridge(name: Channel | Event): (...args: unknown[]) => unknown {
  const method = (window as unknown as Record<string, unknown>)[name]
  if (typeof method !== 'function')
    throw new AppError(ERRORS.IPC_TRANSPORT_FAILED, {
      message: `Desktop bridge unavailable: ${name}`,
    })
  return method as (...args: unknown[]) => unknown
}
export const ipcBridgeRequest = <T>(name: Channel, ...args: unknown[]) =>
  ipcRequest<T>(
    async () =>
      (await bridge(name)(
        ...args.map((value) => ipcSnapshot(value)),
      )) as import('@scnexus/app-shared/errors/app.error').IpcResult<T>,
  )
export function ipcBridgeSubscription<T>(name: Event, listener: (data: T) => void) {
  return ipcSubscription<T>((callback) => {
    const stop = bridge(name)((_event: object, data: T) => callback(data))
    if (typeof stop !== 'function') throw new AppError(ERRORS.IPC_RESULT_INVALID)
    return stop as () => void
  }, listener)
}
