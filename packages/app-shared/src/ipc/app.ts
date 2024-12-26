import type { ApiInvoke } from "./types";

export const apiAppGetVersion = (invoke: ApiInvoke) =>
  invoke("app:get-version");
export const apiAppIsPackaged = (invoke: ApiInvoke) =>
  invoke("app:is-packaged");
export const apiAppGetLocale = (invoke: ApiInvoke) => invoke("app:get-locale");
export const apiAppGetSystemLocale = (invoke: ApiInvoke) =>
  invoke("app:get-system-locale");
export const apiAppGetLocaleCountryCode = (invoke: ApiInvoke) =>
  invoke("app:get-locale-country-code");
export const apiAppGetPreferredSystemLanguages = (invoke: ApiInvoke) =>
  invoke("app:get-preferred-system-languages");
export const apiAppGetPath = (invoke: ApiInvoke, name: string) =>
  invoke("app:get-path", name);
export const apiAppGetPaths = (invoke: ApiInvoke) => invoke("app:get-paths");
