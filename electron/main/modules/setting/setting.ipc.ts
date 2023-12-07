import { ipcMain } from "electron";
import { LocalProfile } from "@shared/types/profile";
import {
  getSettingProfile,
  initSettingProfile,
  setSettingProfileKey,
  setSettingProfileKeyChild,
} from "./setting.service";

export function initSettingIpc() {
  ipcMain.handle("setting::get-profile", async () => {
    return getSettingProfile();
  });
  ipcMain.handle("setting::init-profile", async (_e, path?: string) => {
    return initSettingProfile(path);
  });
  ipcMain.handle("setting::set-profile-key", (_e, key, value) => {
    setSettingProfileKey(key, value);
  });
  ipcMain.handle(
    "setting::set-profile-key-child",
    <T extends keyof LocalProfile, K extends keyof LocalProfile[T]>(
      e: any,
      key: T,
      childKey: K,
      value: LocalProfile[T][K]
    ) => {
      return setSettingProfileKeyChild(key, childKey, value);
    }
  );
}
