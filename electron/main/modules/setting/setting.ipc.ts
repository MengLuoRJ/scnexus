import { app, ipcMain } from "electron";
import {
  getProfile,
  initProfile,
  setProfileKey,
  setProfileKeyChild,
} from "@electron/main/stores/profile";
import { LocalProfile } from "@shared/types/profile";

export function initSettingIpc() {
  ipcMain.handle("setting::get-profile", async () => {
    return getProfile();
  });
  ipcMain.handle("setting::init-profile", async (_e, path: string) => {
    return await initProfile(path);
  });
  ipcMain.handle("setting::set-profile-key", async (_e, key, value) => {
    return setProfileKey(key, value);
  });
  ipcMain.handle(
    "setting::set-profile-key-child",
    async <T extends keyof LocalProfile, K extends keyof LocalProfile[T]>(
      e: any,
      key: T,
      childKey: K,
      value: LocalProfile[T][K]
    ) => {
      return setProfileKeyChild(key, childKey, value);
    }
  );
  ipcMain.handle("setting::get-root-paths", () => {
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
