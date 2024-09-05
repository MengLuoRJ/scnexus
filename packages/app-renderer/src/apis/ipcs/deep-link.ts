import { useIpcRendererOn } from "./ipc-util";

const moduleChannel = "deeplink";

export const ipcDeepLink = {
  onAuthentication: useIpcRendererOn<{
    access_token: string | null;
    refresh_token: string | null;
  }>(`${moduleChannel}:authentication`),
};
