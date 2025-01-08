import * as api from "@scnexus/app-shared/ipc/setting";
import { exposeApis, invoke } from "./common.js";

export const apiSettingGetSetting = () => api.apiSettingGetSetting(invoke);
export const apiSettingGetSettingKey = (key: string) =>
  api.apiSettingGetSettingKey(invoke, key);
export const apiSettingSetSettingKey = (key: string, value: unknown) =>
  api.apiSettingSetSettingKey(invoke, key, value);
export const apiSettingSetTrackerUser = (user: unknown) =>
  api.apiSettingSetTrackerUser(invoke, user);

exposeApis({
  apiSettingGetSetting,
  apiSettingGetSettingKey,
  apiSettingSetSettingKey,
  apiSettingSetTrackerUser,
});
