import type { ShellBridgeApi } from '@scnexus/app-shared/types/shell.type'
import { exposeApis, invoke } from '../ipc-common.js'

export const apiShellOpenExternalWebsite = (link: string) =>
  invoke<void>('shell:open-external-website', link)
export const apiShellOpenExternalDownload = (url: string) =>
  invoke<void>('shell:open-external-download', url)
export const apiShellOpenPath = (path: string) =>
  invoke<string | undefined>('shell:open-path', path)
export const apiShellShowItemInFolder = (path: string) =>
  invoke<void>('shell:show-item-in-folder', path)

exposeApis({
  'shell:open-external-website': apiShellOpenExternalWebsite,
  'shell:open-external-download': apiShellOpenExternalDownload,
  'shell:open-path': apiShellOpenPath,
  'shell:show-item-in-folder': apiShellShowItemInFolder,
} satisfies ShellBridgeApi)
