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
}
