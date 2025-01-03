import * as api from "@scnexus/app-shared/ipc/app";
import { exposeApis, invoke } from "./common.js";

export const apiAppGetVersion = () => api.apiAppGetVersion(invoke);
export const apiAppIsPackaged = () => api.apiAppIsPackaged(invoke);
export const apiAppGetLocale = () => api.apiAppGetLocale(invoke);
export const apiAppGetSystemLocale = () => api.apiAppGetSystemLocale(invoke);
export const apiAppGetLocaleCountryCode = () => api.apiAppGetLocaleCountryCode(invoke);
export const apiAppGetPreferredSystemLanguages = () => api.apiAppGetPreferredSystemLanguages(invoke);
export const apiAppGetPath = (name: string) => api.apiAppGetPath(invoke, name);
export const apiAppGetPaths = () => api.apiAppGetPaths(invoke);

exposeApis({
  apiAppGetVersion,
  apiAppIsPackaged,
  apiAppGetLocale,
  apiAppGetSystemLocale,
  apiAppGetLocaleCountryCode,
  apiAppGetPreferredSystemLanguages,
  apiAppGetPath,
  apiAppGetPaths,
});
