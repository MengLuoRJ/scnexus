import { useIpcApi } from './ipc-util'
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
      window.apiCustomizeReadCompressFileInfo(path),
    )
export const apiCustomizeInstallCompressFile = (path: string) =>
    useIpcApi<ResultUncompress>(
      'apiCustomizeInstallCompressFile',
      window.apiCustomizeInstallCompressFile(path),
    )
export const apiCustomizeValidateCompressFile = (path: string) =>
  useIpcApi('apiCustomizeValidateCompressFile', window.apiCustomizeValidateCompressFile(path))
export const apiCustomizeReadCompressFileInfo7z = (path: string) =>
    useIpcApi<CompressFileInfo | null>(
      'apiCustomizeReadCompressFileInfo7z',
      window.apiCustomizeReadCompressFileInfo7z(path),
    )
export const apiCustomizeInstallCompressFile7z = (path: string) =>
    useIpcApi<ResultUncompress>(
      'apiCustomizeInstallCompressFile7z',
      window.apiCustomizeInstallCompressFile7z(path),
    )
export const apiCustomizeInstallCustomize = (infor: MetadataInformated) =>
    useIpcApi<ResultInstallCustomize>(
      'apiCustomizeInstallCustomize',
      window.apiCustomizeInstallCustomize(infor),
    )
export const apiCustomizeUninstallCustomize = (infor: MetadataInformated) =>
    useIpcApi<ResultUninstallCustomize>(
      'apiCustomizeUninstallCustomize',
      window.apiCustomizeUninstallCustomize(infor),
    )
export const apiCustomizeGetInstalledCustomizeList = () =>
    useIpcApi<CustomizeStore>(
      'apiCustomizeGetInstalledCustomizeList',
      window.apiCustomizeGetInstalledCustomizeList(),
    )
export const apiCustomizeScanInstalledCustomizeList = () =>
    useIpcApi<CustomizeStore>(
      'apiCustomizeScanInstalledCustomizeList',
      window.apiCustomizeScanInstalledCustomizeList(),
    )
export const apiCustomizeRunGameClient = (path?: string) =>
  useIpcApi<void>('apiCustomizeRunGameClient', window.apiCustomizeRunGameClient(path))
export const apiCustomizeRunGameExecutable = (parameters?: GameExecutableParameters) =>
    useIpcApi<void>(
      'apiCustomizeRunGameExecutable',
      window.apiCustomizeRunGameExecutable(parameters),
    )
export const apiCustomizeRunEditorExecutable = (file_path?: string) =>
    useIpcApi<void>(
      'apiCustomizeRunEditorExecutable',
      window.apiCustomizeRunEditorExecutable(file_path),
    )
