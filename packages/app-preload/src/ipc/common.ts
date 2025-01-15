import { contextBridge, ipcRenderer } from "electron";

export type ApiResult<T = unknown> = { data?: T; error?: string };
export type ApiListener = (event: object, ...args: any[]) => void;
export type ExposedApi = (...args: any[]) => Promise<unknown> | (() => void);

export const invoke = (channel: string, ...args: any[]): Promise<ApiResult> =>
  ipcRenderer.invoke(channel, ...args);

export const subscribe = (channel: string, listener: ApiListener) => {
  const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) =>
    listener({}, ...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

export function exposeApis(apis: Record<string, ExposedApi>) {
  Object.entries(apis).forEach(([name, api]) => {
    contextBridge.exposeInMainWorld(name, api);
  });
}
