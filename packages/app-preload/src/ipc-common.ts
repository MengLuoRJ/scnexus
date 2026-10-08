import { contextBridge, ipcRenderer } from "electron";

import {
  AppError,
  ERRORS,
  isErrorDto,
  toErrorDto,
  type IpcResult,
} from "@scnexus/app-shared/errors/app.error";

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

export async function invokeTyped<T>(
  channel: string,
  ...args: unknown[]
): Promise<IpcResult<T>> {
  try {
    const response = await ipcRenderer.invoke(channel, ...args);
    if (response && response.ok === true && Object.hasOwn(response, "data"))
      return response;
    if (response && response.ok === false && isErrorDto(response.error))
      return response;
    return {
      ok: false,
      error: toErrorDto(new AppError(ERRORS.IPC_RESULT_INVALID)),
    };
  } catch {
    const error = toErrorDto(new AppError(ERRORS.IPC_TRANSPORT_FAILED));
    ipcRenderer.send(
      "logging:write",
      {
        level: "error",
        scope: "preload",
        message: "IPC transport failed",
        error,
      },
      "preload",
    );
    return { ok: false, error };
  }
}
export function subscribeTyped<T>(
  channel: string,
  listener: (data: T) => void,
) {
  const wrapped = (_event: Electron.IpcRendererEvent, data: T) =>
    listener(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}
