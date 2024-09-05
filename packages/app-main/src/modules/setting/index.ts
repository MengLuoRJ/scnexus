import { settingStore } from "@/stores/setting";
import { initSettingIpc } from "./setting.ipc";
import { setSentryUser } from "@/utils/sentry";

export async function initSettingModule(): Promise<void> {
  const setting = settingStore.store;

  if (setting.IS_INITIAL) {
    setSentryUser({
      client_id: setting.CLIENT_ID,
    });
  }

  initSettingIpc();
}
