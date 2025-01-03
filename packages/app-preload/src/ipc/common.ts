import { contextBridge, ipcRenderer } from "electron";
import type {
  ApiInvoke,
  ApiListener,
  ApiSubscribe,
} from "@scnexus/app-shared/ipc/types";

export const invoke: ApiInvoke = (channel, ...args) =>
  ipcRenderer.invoke(channel, ...args);

export const subscribe: ApiSubscribe = (channel, listener) => {
  const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) =>
    listener({}, ...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

export type ExposedApi = (...args: any[]) => Promise<unknown> | (() => void);

export function exposeApis(apis: Record<string, ExposedApi>) {
  Object.entries(apis).forEach(([name, api]) => {
    contextBridge.exposeInMainWorld(name, api);
  });
}

export type { ApiListener };
