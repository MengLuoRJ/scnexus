import { ipcApi, useIpcApi } from './ipc-util'
import type { CustomizeStore } from '@scnexus/app-shared/stores/customize.store'
import type {
  CompressFileInfo,
  ResultInstallCustomize,
  ResultUncompress,
  ResultUninstallCustomize,
} from '@scnexus/app-shared/types/customize.type'
import type { GameExecutableParameters } from '@scnexus/app-shared/types/customize/client-launcher.type'
import type { MetadataInformated } from 'scnexus-standard/metadata'

export const apiCustomizeReadCompressFileInfo = (path: string) =>
  useIpcApi<CompressFileInfo | null>(
    'apiCustomizeReadCompressFileInfo',
    ipcApi['customize:read-compress-file-info'](path),
  )
export const apiCustomizeInstallCompressFile = (path: string) =>
  useIpcApi<ResultUncompress>(
    'apiCustomizeInstallCompressFile',
    ipcApi['customize:install-compress-file'](path),
  )
export const apiCustomizeValidateCompressFile = (path: string) =>
  useIpcApi('apiCustomizeValidateCompressFile', ipcApi['customize:validate-compress-file'](path))
export const apiCustomizeReadCompressFileInfo7z = (path: string) =>
  useIpcApi<CompressFileInfo | null>(
    'apiCustomizeReadCompressFileInfo7z',
    ipcApi['customize:read-compress-file-info-7z'](path),
  )
export const apiCustomizeInstallCompressFile7z = (path: string) =>
  useIpcApi<ResultUncompress>(
    'apiCustomizeInstallCompressFile7z',
    ipcApi['customize:install-compress-file-7z'](path),
  )
export const apiCustomizeInstallCustomize = (infor: MetadataInformated) =>
  useIpcApi<ResultInstallCustomize>(
    'apiCustomizeInstallCustomize',
    ipcApi['customize:install-customize'](infor),
  )
export const apiCustomizeUninstallCustomize = (infor: MetadataInformated) =>
  useIpcApi<ResultUninstallCustomize>(
    'apiCustomizeUninstallCustomize',
    ipcApi['customize:uninstall-customize'](infor),
  )
export const apiCustomizeGetInstalledCustomizeList = () =>
  useIpcApi<CustomizeStore>(
    'apiCustomizeGetInstalledCustomizeList',
    ipcApi['customize:get-installed-customize-list'](),
  )
export const apiCustomizeScanInstalledCustomizeList = () =>
  useIpcApi<CustomizeStore>(
    'apiCustomizeScanInstalledCustomizeList',
    ipcApi['customize:scan-installed-customize-list'](),
  )
export const apiCustomizeRunGameClient = (path?: string) =>
  useIpcApi<void>('apiCustomizeRunGameClient', ipcApi['customize:run-game-client'](path))
export const apiCustomizeRunGameExecutable = (parameters?: GameExecutableParameters) =>
  useIpcApi<void>(
    'apiCustomizeRunGameExecutable',
    ipcApi['customize:run-game-executable'](parameters),
  )
export const apiCustomizeRunEditorExecutable = (file_path?: string) =>
  useIpcApi<void>(
    'apiCustomizeRunEditorExecutable',
    ipcApi['customize:run-editor-executable'](file_path),
  )
