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

export function exposeInvoke(
  name: string,
  api: (invoke: ApiInvoke, ...args: any[]) => Promise<unknown>,
) {
  contextBridge.exposeInMainWorld(name, (...args: any[]) =>
    api(invoke, ...args),
  );
}

export function exposeSubscribe(
  name: string,
  api: (subscribe: ApiSubscribe, listener: ApiListener) => () => void,
) {
  contextBridge.exposeInMainWorld(name, (listener: ApiListener) =>
    api(subscribe, listener),
  );
}
