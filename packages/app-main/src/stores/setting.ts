import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import { v4 as uuid } from "uuid";

import { SettingStore } from "@scnexus/app-shared/stores/setting.store";

const appDataRoot = app.getPath("userData");

const defaultProfile: SettingStore = {
  IS_INITIAL: false,
  CLIENT_ID: uuid(),
  DOWNLOAD_FOLDER: app.getPath("downloads"),
  LAST_UPDATED_TIME: new Date().getTime(),
};

export const settingStore = new Store<SettingStore>({
  name: "store-setting",
  cwd: join(appDataRoot, "SCNexusStorage"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export const settingStoreFunction = {
  get: (key: keyof SettingStore) => settingStore.get(key),
  set: (key: keyof SettingStore, value: SettingStore[keyof SettingStore]) => {
    settingStore.set(key, value);
  },
};
