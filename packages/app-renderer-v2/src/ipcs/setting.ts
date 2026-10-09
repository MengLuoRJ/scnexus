import { desktop, request, ipcSnapshot, subscription } from "./internal/ipc-common";
import type { DesktopApi } from "@scnexus/app-shared/types/desktop.type";
import type { SettingData } from "@scnexus/app-shared/stores/setting.store";
import type { SettingPreferences } from "@scnexus/app-shared/types/desktop.type";

export const apiSettingGetSnapshot = () => request(() => desktop().setting.getSnapshot());
export const apiSettingGetKey = <K extends keyof SettingData>(key: K) =>
  request(() => desktop().setting.getKey(key));
export const apiSettingUpdateKey = <K extends keyof SettingPreferences>(
  key: K,
  value: SettingPreferences[K],
) => request(() => desktop().setting.updateKey(key, value));
export const apiSettingUpdate = (patch: Partial<SettingPreferences>) =>
  request(() => desktop().setting.update(ipcSnapshot(patch)));
export const apiSettingReplace = (preferences: SettingPreferences) =>
  request(() => desktop().setting.replace(ipcSnapshot(preferences)));
export const apiSettingOnChanged = (listener: Parameters<DesktopApi["setting"]["onChanged"]>[0]) =>
  subscription((callback) => desktop().setting.onChanged(callback), listener);
