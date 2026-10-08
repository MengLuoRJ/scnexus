import { exposeApis, invoke } from "../ipc-common.js";

export const apiAppGetVersion = () => invoke("app:get-version");
export const apiAppIsPackaged = () => invoke("app:is-packaged");
export const apiAppGetLocale = () => invoke("app:get-locale");
export const apiAppGetSystemLocale = () => invoke("app:get-system-locale");
export const apiAppGetLocaleCountryCode = () =>
  invoke("app:get-locale-country-code");
export const apiAppGetPreferredSystemLanguages = () =>
  invoke("app:get-preferred-system-languages");
export const apiAppGetPath = (name: string) => invoke("app:get-path", name);
export const apiAppGetPaths = () => invoke("app:get-paths");

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
