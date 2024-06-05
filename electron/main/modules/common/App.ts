import { ipcHandle } from "@electron/main/utils/ipc-util";
import { app, ipcMain } from "electron";

const moduleChannel = "app";

function initAppIpc() {
  ipcHandle(`${moduleChannel}:get-version`, () => app.getVersion());
  
  ipcHandle(`${moduleChannel}:is-packaged`, () => app.isPackaged);

  ipcHandle(`${moduleChannel}:get-locale`, () => app.getLocale());
  ipcHandle(`${moduleChannel}:get-system-locale`, () => app.getSystemLocale());

  ipcHandle(`${moduleChannel}:get-locale-country-code`, () =>
    app.getLocaleCountryCode()
  );

  ipcHandle(`${moduleChannel}:get-preferred-system-languages`, () =>
    app.getPreferredSystemLanguages()
  );

  ipcHandle(
    `${moduleChannel}:get-path`,
    (name: Parameters<typeof app.getPath>[0]) => app.getPath(name)
  );
  ipcHandle(`${moduleChannel}:get-paths`, () => {
    return {
      home: app.getPath("home"),
      userData: app.getPath("userData"),
      appData: app.getPath("appData"),
      documents: app.getPath("documents"),
      logs: app.getPath("logs"),
      crashDumps: app.getPath("crashDumps"),
    };
  });
}

export function initAppModule() {
  initAppIpc();
}
