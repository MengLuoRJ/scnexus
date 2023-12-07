import { app, ipcMain } from "electron";

export function initAppIpc() {
  ipcMain.handle("app::get-version", () => {
    return app.getVersion();
  });
  ipcMain.handle("app::get-locale", () => {
    return app.getLocale();
  });
  ipcMain.handle("app::get-system-locale", () => {
    return app.getSystemLocale();
  });
  ipcMain.handle("app::get-locale-country-code", () => {
    return app.getLocaleCountryCode();
  });
  ipcMain.handle("app::get-preferred-system-languages", () => {
    return app.getPreferredSystemLanguages();
  });
  ipcMain.handle("app::get-paths", () => {
    return {
      ahome: app.getPath("home"),
      userData: app.getPath("userData"),
      appData: app.getPath("appData"),
      document: app.getPath("documents"),
      logs: app.getPath("logs"),
      crashDumps: app.getPath("crashDumps"),
    };
  });
}
