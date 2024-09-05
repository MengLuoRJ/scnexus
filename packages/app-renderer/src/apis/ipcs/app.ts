import { useIpcRendererInvoke } from "./ipc-util";

const moduleChannel = "app";

export const ipcApp = {
  getVersion: () =>
    useIpcRendererInvoke<string>(`${moduleChannel}:get-version`),

  isPackaged: () =>
    useIpcRendererInvoke<boolean>(`${moduleChannel}:is-packaged`),

  getLocale: () => useIpcRendererInvoke<string>(`${moduleChannel}:get-locale`),

  getSystemLocale: () =>
    useIpcRendererInvoke<string>(`${moduleChannel}:get-system-locale`),
  getLocaleCountryCode: () =>
    useIpcRendererInvoke<string>(`${moduleChannel}:get-locale-country-code`),

  getPreferredSystemLanguages: () =>
    useIpcRendererInvoke<string[]>(
      `${moduleChannel}:get-preferred-system-languages`
    ),

  getPath: (
    name:
      | "home"
      | "appData"
      | "userData"
      | "sessionData"
      | "temp"
      | "exe"
      | "module"
      | "desktop"
      | "documents"
      | "downloads"
      | "music"
      | "pictures"
      | "videos"
      | "recent"
      | "logs"
      | "crashDumps"
  ) => useIpcRendererInvoke<string>(`${moduleChannel}:get-path`, name),
  getPaths: () =>
    useIpcRendererInvoke<{ [key: string]: string }>(
      `${moduleChannel}:get-paths`
    ),
};
