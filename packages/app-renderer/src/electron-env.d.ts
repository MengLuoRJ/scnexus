export {};
declare global {
  interface Window {
    ipcRenderer: import("electron").IpcRenderer;
    webUtils: import("electron").WebUtils;
  }
}
