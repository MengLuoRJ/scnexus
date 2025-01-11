import * as api from "@scnexus/app-shared/ipc/app";
import { exposeApis, invoke } from "./common.js";

export const apiAppGetVersion = () => api.apiAppGetVersion(invoke);
export const apiAppIsPackaged = () => api.apiAppIsPackaged(invoke);
export const apiAppGetLocale = () => api.apiAppGetLocale(invoke);
export const apiAppGetSystemLocale = () => api.apiAppGetSystemLocale(invoke);
export const apiAppGetLocaleCountryCode = () =>
  api.apiAppGetLocaleCountryCode(invoke);
export const apiAppGetPreferredSystemLanguages = () =>
  api.apiAppGetPreferredSystemLanguages(invoke);
export const apiAppGetPath = (name: string) => api.apiAppGetPath(invoke, name);
export const apiAppGetPaths = () => api.apiAppGetPaths(invoke);

exposeApis({
  "app:get-version": apiAppGetVersion,
  "app:is-packaged": apiAppIsPackaged,
  "app:get-locale": apiAppGetLocale,
  "app:get-system-locale": apiAppGetSystemLocale,
  "app:get-locale-country-code": apiAppGetLocaleCountryCode,
  "app:get-preferred-system-languages": apiAppGetPreferredSystemLanguages,
  "app:get-path": apiAppGetPath,
  "app:get-paths": apiAppGetPaths,
});
