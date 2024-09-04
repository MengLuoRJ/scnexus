import { contextBridge, ipcRenderer } from "electron";

const ipcRendererExposed = {
  invoke: async (channel: string, ...args: any[]) => {
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (
    channel: string,
    listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
  ) => {
    ipcRenderer.on(channel, listener);
  },
  removeListener: (
    channel: string,
    listener: (event: Electron.IpcRendererEvent, ...args: any[]) => void
  ) => {
    ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererExposed);
