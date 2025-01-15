import { exposeApis, invoke } from "./common.js";

export const apiProfileGetProfile = () => invoke("profile:get-profile");
export const apiProfileGetProfileKey = (key: string) =>
  invoke("profile:get-profile-key", key);
export const apiProfileSetProfileKey = (key: string, value: unknown) =>
  invoke("profile:set-profile-key", key, value);
export const apiProfileInitGameService = (path?: string) =>
  invoke("profile:init-game-service", path);

exposeApis({
  "profile:get-profile": apiProfileGetProfile,
  "profile:get-profile-key": apiProfileGetProfileKey,
  "profile:set-profile-key": apiProfileSetProfileKey,
  "profile:init-game-service": apiProfileInitGameService,
});
