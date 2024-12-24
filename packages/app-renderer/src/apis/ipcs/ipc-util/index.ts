import { useDiscreteApi } from "@/composables/useDiscreteApi";
import { tryOnScopeDispose } from "@vueuse/core";
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
  event: object,
  arg1: P1,
  arg2?: P2,
  arg3?: P3,
  ...args: any[]
) => void;

export const useIpcRendererOn =
  <T = any>(channel: string) =>
  (listener: RendererListener<T>) => {
    const unsubscribe = ipcRenderer.on(channel, listener);
    tryOnScopeDispose(unsubscribe);
  };

export const useIpcRendererOnDirectly = <T = any>(
  channel: string,
  listener: RendererListener<T>
) => {
  const unsubscribe = ipcRenderer.on(channel, listener);
  tryOnScopeDispose(unsubscribe);
};
