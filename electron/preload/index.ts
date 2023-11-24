import { contextBridge, ipcRenderer } from "electron";

const updaterChannels = {
  onCheckingForUpdate: (callback: (event: Electron.IpcRendererEvent) => void) =>
    ipcRenderer.on("updater::checking-for-update", callback),
  onUpdateAvailable: (
    callback: (event: Electron.IpcRendererEvent, info: any) => void
  ) => ipcRenderer.on("updater::update-available", callback),
  onUpdateNotAvailable: (
    callback: (event: Electron.IpcRendererEvent) => void
  ) => ipcRenderer.on("updater::update-not-available", callback),
  onDownloadProgress: (
    callback: (event: Electron.IpcRendererEvent, progress: any) => void
  ) => ipcRenderer.on("updater::download-progress", callback),
  onUpdateDownloaded: (callback: (event: Electron.IpcRendererEvent) => void) =>
    ipcRenderer.on("updater::update-downloaded", callback),
  onError: (callback: (event: Electron.IpcRendererEvent, err: any) => void) =>
    ipcRenderer.on("updater::error", callback),
  clear: () => {
    ipcRenderer.removeAllListeners("updater::checking-for-update");
    ipcRenderer.removeAllListeners("updater::update-available");
    ipcRenderer.removeAllListeners("updater::update-not-available");
    ipcRenderer.removeAllListeners("updater::download-progress");
    ipcRenderer.removeAllListeners("updater::update-downloaded");
    ipcRenderer.removeAllListeners("updater::error");
  },
};

const deeplinkChannels = {
  onAuthentication: (
    callback: (event: Electron.IpcRendererEvent, code: string) => void
  ) => ipcRenderer.on("deeplink::authentication", callback),
};

contextBridge.exposeInMainWorld("ipcRenderer", {
  ...ipcRenderer,
  updater: updaterChannels,
  deeplink: deeplinkChannels,
});
