import type { ApiInvoke } from "./types";

export const apiProfileGetProfile = (invoke: ApiInvoke) =>
  invoke("profile:get-profile");
export const apiProfileGetProfileKey = (invoke: ApiInvoke, key: string) =>
  invoke("profile:get-profile-key", key);
export const apiProfileSetProfileKey = (
  invoke: ApiInvoke,
  key: string,
  value: unknown,
) => invoke("profile:set-profile-key", key, value);
export const apiProfileInitGameService = (invoke: ApiInvoke, path?: string) =>
  invoke("profile:init-game-service", path);
