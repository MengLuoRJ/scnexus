import { settingStore, settingStoreFunction } from "@electron/main/stores/setting";
import { ipcHandle } from "@electron/main/utils/ipc-util";
import { setSentryUser } from "@electron/main/utils/sentry";

export function initSettingIpc() {
  ipcHandle("setting:get-setting", () => settingStore.store);
  ipcHandle("setting:get-setting-key", settingStoreFunction.get);
  ipcHandle("setting:set-setting-key", settingStoreFunction.set);

  ipcHandle("setting:set-tracker-user", setSentryUser);
}
