import { useIpcRendererInvoke } from "./ipc-util";
import { CustomizeStore } from "@scnexus/app-shared/stores/customize.store";
import {
  CompressFileInfo,
  ResultInstallCustomize,
  ResultUncompress,
  ResultUninstallCustomize,
} from "@scnexus/app-shared/types/customize.type";
import { GameExecutableParameters } from "@scnexus/app-shared/types/customize/client-launcher.type";
import { MetadataInformated } from "scnexus-standard/metadata";

const moduleChannel = "customize";

export const ipcCustomize = {
  readCompressFileInfo: (path: string) =>
    useIpcRendererInvoke<CompressFileInfo | null>(
      `${moduleChannel}:read-compress-file-info`,
      path
    ),
  installCompressFile: (path: string) =>
    useIpcRendererInvoke<ResultUncompress>(
      `${moduleChannel}:install-compress-file`,
      path
    ),
  validateCompressFile: (path: string) =>
    useIpcRendererInvoke(`${moduleChannel}:install-compress-file`, path),

  readCompressFileInfo7z: (path: string) =>
    useIpcRendererInvoke<CompressFileInfo | null>(
      `${moduleChannel}:read-compress-file-info-7z`,
      path
    ),
  installCompressFile7z: (path: string) =>
    useIpcRendererInvoke<ResultUncompress>(
      `${moduleChannel}:install-compress-file-7z`,
      path
    ),

  installCustomize: (infor: MetadataInformated) =>
    useIpcRendererInvoke<ResultInstallCustomize>(
      `${moduleChannel}:install-customize`,
      infor
    ),
  uninstallCustomize: (infor: MetadataInformated) =>
    useIpcRendererInvoke<ResultUninstallCustomize>(
      `${moduleChannel}:uninstall-customize`,
      infor
    ),
  getInstalledCustomizeList: () =>
    useIpcRendererInvoke<CustomizeStore>(
      `${moduleChannel}:get-installed-customize-list`
    ),
  scanInstalledCustomizeList: () =>
    useIpcRendererInvoke<CustomizeStore>(
      `${moduleChannel}:scan-installed-customize-list`
    ),

  runGameClient: (path?: string) =>
    useIpcRendererInvoke<void>(`${moduleChannel}:run-game-client`, path),
  runGameExecutable: (parameters?: GameExecutableParameters) =>
    useIpcRendererInvoke<void>(
      `${moduleChannel}:run-game-executable`,
      parameters
    ),
  runEditorExecutable: (file_path?: string) =>
    useIpcRendererInvoke<void>(
      `${moduleChannel}:run-editor-executable`,
      file_path
    ),
};
