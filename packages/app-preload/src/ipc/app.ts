import * as api from "@scnexus/app-shared/ipc/app";
import { exposeInvoke } from "./common.js";

exposeInvoke("apiAppGetVersion", api.apiAppGetVersion);
exposeInvoke("apiAppIsPackaged", api.apiAppIsPackaged);
exposeInvoke("apiAppGetLocale", api.apiAppGetLocale);
exposeInvoke("apiAppGetSystemLocale", api.apiAppGetSystemLocale);
exposeInvoke("apiAppGetLocaleCountryCode", api.apiAppGetLocaleCountryCode);
exposeInvoke("apiAppGetPreferredSystemLanguages", api.apiAppGetPreferredSystemLanguages);
exposeInvoke("apiAppGetPath", api.apiAppGetPath);
exposeInvoke("apiAppGetPaths", api.apiAppGetPaths);