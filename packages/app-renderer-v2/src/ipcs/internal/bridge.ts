import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { request, subscription, ipcSnapshot } from './ipc-common'

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
  | 'shell:open-external-website'
  | 'shell:open-path'
  | 'shell:show-item-in-folder'
  | 'updater:status'
  | 'updater:check-for-updates'
  | 'updater:check-for-updates-and-notify'
  | 'updater:download-update'
  | 'updater:quit-and-install'
  | 'workshop:get-file-md5'
  | 'workshop:get-file-md5-wasm'
  | 'workshop:write-metadata'
  | 'workshop:upload-compressed-file'
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
export const bridgeRequest = <T>(name: Channel, ...args: unknown[]) =>
  request<T>(
    async () =>
      (await bridge(name)(
        ...args.map((value) => ipcSnapshot(value)),
      )) as import('@scnexus/app-shared/errors/app.error').IpcResult<T>,
  )
export function bridgeSubscription<T>(name: Event, listener: (data: T) => void) {
  return subscription<T>((callback) => {
    const stop = bridge(name)((_event: object, data: T) => callback(data))
    if (typeof stop !== 'function') throw new AppError(ERRORS.IPC_RESULT_INVALID)
    return stop as () => void
  }, listener)
}
