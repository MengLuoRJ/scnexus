import type { IpcMainInvokeEvent } from 'electron'
import type { InstallSelection } from '@scnexus/app-shared/types/content.type'
import { ipcHandle } from '../../utils/ipc-util'
import * as service from './index'

export function initDependencyIpc() {
  ipcHandle('dependency:analyze', service.analyze)
  ipcHandle(
    'dependency:install',
    (event: IpcMainInvokeEvent, selection: InstallSelection) =>
      service.install(selection, (progress) => {
        if (!event.sender.isDestroyed()) event.sender.send('dependency:install-progress', progress)
      }),
    true,
  )
  ipcHandle('dependency:list', service.list)
  ipcHandle('dependency:scan', service.scan)
  ipcHandle('dependency:prepare-uninstall', service.prepareUninstall)
  ipcHandle('dependency:uninstall', service.uninstall)
}
