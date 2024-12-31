import * as api from "@scnexus/app-shared/ipc/setting";
import { exposeInvoke } from "./common.js";

exposeInvoke("apiSettingGetSetting", api.apiSettingGetSetting);
exposeInvoke("apiSettingGetSettingKey", api.apiSettingGetSettingKey);
exposeInvoke("apiSettingSetSettingKey", api.apiSettingSetSettingKey);
exposeInvoke("apiSettingSetTrackerUser", api.apiSettingSetTrackerUser);
