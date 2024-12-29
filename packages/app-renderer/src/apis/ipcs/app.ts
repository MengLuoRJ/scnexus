import { useIpcApi } from "./ipc-util";

export const ipcApp = {
  getVersion: () =>
    useIpcApi<string>("apiAppGetVersion", window.apiAppGetVersion()),

  isPackaged: () =>
    useIpcApi<boolean>("apiAppIsPackaged", window.apiAppIsPackaged()),

  getLocale: () => useIpcApi<string>("apiAppGetLocale", window.apiAppGetLocale()),

  getSystemLocale: () =>
    useIpcApi<string>("apiAppGetSystemLocale", window.apiAppGetSystemLocale()),
  getLocaleCountryCode: () =>
    useIpcApi<string>("apiAppGetLocaleCountryCode", window.apiAppGetLocaleCountryCode()),

  getPreferredSystemLanguages: () =>
    useIpcApi<string[]>("apiAppGetPreferredSystemLanguages", window.apiAppGetPreferredSystemLanguages()),

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
  ) => useIpcApi<string>("apiAppGetPath", window.apiAppGetPath(name)),
  getPaths: () =>
    useIpcApi<{ [key: string]: string }>("apiAppGetPaths", window.apiAppGetPaths()),
};
