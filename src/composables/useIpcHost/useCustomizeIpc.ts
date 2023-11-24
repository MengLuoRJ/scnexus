import { CustomizeInformation, Metadata } from "@shared/types";
import { CompressFileInfo, ResultUnzipFile } from "@shared/types/customize";

const ipcRenderer = window.ipcRenderer;

export function readCompressFileInfo(
  path: string,
  configs?: { tolerance?: boolean }
): Promise<CompressFileInfo | null> {
  return ipcRenderer.invoke(
    "customize::read-compress-file-info",
    path,
    configs
  );
}

export function installCompressFile(path: string) {
  return ipcRenderer.invoke("customize::install-compress-file", path);
}

export function unzipCompressFileSimply(path: string) {
  return ipcRenderer.invoke("customize::unzip-compress-file-simply", path);
}

export function activeCustomize(info: CustomizeInformation) {
  return ipcRenderer.invoke("customize::active-customize", info);
}

export function unactiveCustomize(info: CustomizeInformation) {
  return ipcRenderer.invoke("customize::unactive-customize", info);
}

export function uninstallCustomize(info: CustomizeInformation) {
  return ipcRenderer.invoke("customize::uninstall-customize", info);
}

export function scanInstalledCusomize() {
  return ipcRenderer.invoke("customize::scan-installed-customize");
}

export async function runGameClient(path?: string) {
  const result = await window.ipcRenderer.invoke(
    "customize::run-game-client",
    path
  );
  return result;
}

export async function runEditorClient(path?: string) {
  const result = await window.ipcRenderer.invoke(
    "customize::run-editor-client",
    path
  );
  return result;
}

/**
 * @deprecated
 */
export async function readMetadataFromZipFile(path: string): Promise<Metadata> {
  const metadata = await window.ipcRenderer.invoke(
    "customize::read-metadata-from-zip",
    path
  );
  return metadata;
}

/**
 * @deprecated
 */
export async function unzipFile(path: string) {
  const result = await window.ipcRenderer.invoke("customize::unzip-file", path);
  return result;
}

/**
 * @deprecated
 */
export async function unzipFileSimply(path: string): Promise<ResultUnzipFile> {
  const result = await window.ipcRenderer.invoke(
    "customize::unzip-file-simply",
    path
  );
  return result;
}
