import type { ApiInvoke } from "./types";

export const apiSettingGetSetting = (invoke: ApiInvoke) =>
  invoke("setting:get-setting");
export const apiSettingGetSettingKey = (invoke: ApiInvoke, key: string) =>
  invoke("setting:get-setting-key", key);
export const apiSettingSetSettingKey = (
  invoke: ApiInvoke,
  key: string,
  value: unknown,
) => invoke("setting:set-setting-key", key, value);
export const apiSettingSetTrackerUser = (invoke: ApiInvoke, user: unknown) =>
  invoke("setting:set-tracker-user", user);
