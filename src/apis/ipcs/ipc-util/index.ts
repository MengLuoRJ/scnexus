import { useDiscreteApi } from "@/composables/useDiscreteApi";
import { tryOnScopeDispose } from "@vueuse/core";
import type { IpcRendererEvent } from "electron";
import { toRaw } from "vue";

export const ipcRenderer: Window["ipcRenderer"] = window.ipcRenderer;

export const useIpcRendererInvoke = async <T = any>(
  channel: string,
  ...args: any[]
): Promise<{ data: T | undefined; error?: string }> => {
  const rawArgs = args.map((arg) => toRaw(arg));
  const { data, error } = await ipcRenderer.invoke(channel, ...rawArgs);
  if (error) {
    const { message } = useDiscreteApi(["message"]);
    message.warning("后台错误：" + channel + " error: " + error);
  }
  return {
    data: (data as T) ?? undefined,
    error: error,
  };
};

export type RendererListener<P1 = any, P2 = any, P3 = any> = (
  event: IpcRendererEvent,
  arg1: P1,
  arg2?: P2,
  arg3?: P3,
  ...args: any[]
) => void;

/**
 * Sets up an IPC renderer listener for the specified channel.
 * @param channel The IPC channel to listen to.
 * @param listener Optional listener function to handle the IPC messages.
 * @returns A function to set up the listener if not provided initially.
 */
export const useIpcRendererOn = <T = any>(
  channel: string,
  listener?: RendererListener<T>
): ((listener: RendererListener<T>) => void) | void => {
  const setupListener = (listener: RendererListener<T>) => {
    tryOnScopeDispose(() => {
      ipcRenderer.removeListener(channel, listener);
    });
    ipcRenderer.on(channel, listener);
  };

  if (listener) {
    setupListener(listener);
  } else {
    return (listener: RendererListener<T>) => {
      setupListener(listener);
    };
  }
};
