import { SettingStore } from "@electron/main/stores/setting";
import { useIpcRendererInvoke } from "./ipc-util";
const moduleChannel = "setting";

export const ipcSetting = {
  getSetting: () =>
    useIpcRendererInvoke<SettingStore>(`${moduleChannel}:get-setting`),
  getSettingKey: (key: keyof SettingStore) =>
    useIpcRendererInvoke<SettingStore[keyof SettingStore]>(
      `${moduleChannel}:get-setting-key`,
      key
    ),
  setSettingKey: (
    key: keyof SettingStore,
    value: SettingStore[keyof SettingStore]
  ) =>
    useIpcRendererInvoke<void>(`${moduleChannel}:set-setting-key`, key, value),

  setTrackerUser: (user: {
    id?: string;
    username?: string;
    client_id?: string;
  }) => useIpcRendererInvoke<void>(`${moduleChannel}:set-tracker-user`, user),
};
