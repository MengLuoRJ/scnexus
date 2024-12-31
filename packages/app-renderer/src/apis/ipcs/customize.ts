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

export const ipcCustomize = {
  readCompressFileInfo: (path: string) =>
    useIpcApi<CompressFileInfo | null>(
      'apiCustomizeReadCompressFileInfo',
      window.apiCustomizeReadCompressFileInfo(path),
    ),
  installCompressFile: (path: string) =>
    useIpcApi<ResultUncompress>(
      'apiCustomizeInstallCompressFile',
      window.apiCustomizeInstallCompressFile(path),
    ),
  validateCompressFile: (path: string) =>
    useIpcApi('apiCustomizeValidateCompressFile', window.apiCustomizeValidateCompressFile(path)),

  readCompressFileInfo7z: (path: string) =>
    useIpcApi<CompressFileInfo | null>(
      'apiCustomizeReadCompressFileInfo7z',
      window.apiCustomizeReadCompressFileInfo7z(path),
    ),
  installCompressFile7z: (path: string) =>
    useIpcApi<ResultUncompress>(
      'apiCustomizeInstallCompressFile7z',
      window.apiCustomizeInstallCompressFile7z(path),
    ),

  installCustomize: (infor: MetadataInformated) =>
    useIpcApi<ResultInstallCustomize>(
      'apiCustomizeInstallCustomize',
      window.apiCustomizeInstallCustomize(infor),
    ),
  uninstallCustomize: (infor: MetadataInformated) =>
    useIpcApi<ResultUninstallCustomize>(
      'apiCustomizeUninstallCustomize',
      window.apiCustomizeUninstallCustomize(infor),
    ),
  getInstalledCustomizeList: () =>
    useIpcApi<CustomizeStore>(
      'apiCustomizeGetInstalledCustomizeList',
      window.apiCustomizeGetInstalledCustomizeList(),
    ),
  scanInstalledCustomizeList: () =>
    useIpcApi<CustomizeStore>(
      'apiCustomizeScanInstalledCustomizeList',
      window.apiCustomizeScanInstalledCustomizeList(),
    ),

  runGameClient: (path?: string) =>
    useIpcApi<void>('apiCustomizeRunGameClient', window.apiCustomizeRunGameClient(path)),
  runGameExecutable: (parameters?: GameExecutableParameters) =>
    useIpcApi<void>(
      'apiCustomizeRunGameExecutable',
      window.apiCustomizeRunGameExecutable(parameters),
    ),
  runEditorExecutable: (file_path?: string) =>
    useIpcApi<void>(
      'apiCustomizeRunEditorExecutable',
      window.apiCustomizeRunEditorExecutable(file_path),
    ),
}
