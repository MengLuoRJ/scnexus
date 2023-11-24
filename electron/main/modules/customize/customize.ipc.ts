import { ipcMain } from "electron";
import * as customizeService from "./customize.service";
import { CustomizeInformation } from "@shared/types";

export function initCustomizeIpc() {

  ipcMain.handle("customize::read-compress-file-info", (e, path: string, configs?: { tolerance?: boolean }) => {
    return customizeService.readCompressFileInfo(path, configs);
  });

  ipcMain.handle("customize::install-compress-file", (e, path: string) => {
    return customizeService.installCompressFile(path);
  });

  ipcMain.handle("customize::unzip-compress-file-simply", (e, path: string) => {
    return customizeService.unzipCompressFileSimply(path);
  });

  ipcMain.handle("customize::active-customize", (e, info: CustomizeInformation) => {
    return customizeService.activeCustomize(info);
  });

  ipcMain.handle("customize::unactive-customize", (e, info: CustomizeInformation) => {
    return customizeService.unactiveCustomize(info);
  });

  ipcMain.handle("customize::uninstall-customize", (e, info: CustomizeInformation) => {
    return customizeService.uninstallCustomize(info);
  });

  ipcMain.handle("customize::scan-installed-customize", () => {
    return customizeService.scanInstalledCusomize();
  });


  ipcMain.handle("customize::run-game-client", (e, path?: string) => {
    return customizeService.runGameClient(path);
  });
  ipcMain.handle("customize::run-editor-client", (e, path?: string) => {
    return customizeService.runEditorClient(path);
  });




  ipcMain.handle("customize::read-metadata-from-zip", (e, path: string) => {
    return customizeService.readMetadataFromZipFiles(path);
  });
  ipcMain.handle("customize::unzip-file-simply", (e, path: string) => {
    return customizeService.unzipFileSimply(path);
  });

}
