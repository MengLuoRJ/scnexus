import { settingStore, settingStoreFunction } from "@/stores/setting";
import { ipcHandle } from "@/utils/ipc-util";
import { setSentryUser } from "@/utils/sentry";

export function initSettingIpc() {
  ipcHandle("setting:get-setting", () => settingStore.store);
  ipcHandle("setting:get-setting-key", settingStoreFunction.get);
  ipcHandle("setting:set-setting-key", settingStoreFunction.set);

  ipcHandle("setting:set-tracker-user", setSentryUser);
}
