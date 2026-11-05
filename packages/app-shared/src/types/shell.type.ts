import type { IpcResult } from '../errors/app.error.js'

export interface ShellBridgeApi {
  'shell:open-external-website'(url: string): Promise<IpcResult<void>>
  'shell:open-external-download'(url: string): Promise<IpcResult<void>>
  'shell:open-path'(path: string): Promise<IpcResult<string | undefined>>
  'shell:show-item-in-folder'(path: string): Promise<IpcResult<void>>
}
