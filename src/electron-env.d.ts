export {};
declare global {
  interface Window {
    // Expose some Api through preload script
    ipcRenderer: import("electron").IpcRenderer & {
      updater: {
        onCheckingForUpdate: (
          callback: (event: Electron.IpcRendererEvent) => void
        ) => void;
        onUpdateAvailable: (
          callback: (event: Electron.IpcRendererEvent, info) => void
        ) => void;
        onUpdateNotAvailable: (
          callback: (event: Electron.IpcRendererEvent) => void
        ) => void;
        onDownloadProgress: (
          callback: (event: Electron.IpcRendererEvent, progress) => void
        ) => void;
        onUpdateDownloaded: (
          callback: (event: Electron.IpcRendererEvent) => void
        ) => void;
        onError: (
          callback: (event: Electron.IpcRendererEvent, err) => void
        ) => void;
        clearCheck: () => void;
        clearDownload: () => void;
        clearError: () => void;
        clearAll: () => void;
      };
      deeplink: {
        onAuthentication: (
          callback: (event: Electron.IpcRendererEvent, code: string) => void
        ) => void;
      };
    };
  }
}
