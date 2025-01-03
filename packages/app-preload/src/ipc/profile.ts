import * as api from "@scnexus/app-shared/ipc/profile";
import { exposeApis, invoke } from "./common.js";

export const apiProfileGetProfile = () => api.apiProfileGetProfile(invoke);
export const apiProfileGetProfileKey = (key: string) => api.apiProfileGetProfileKey(invoke, key);
export const apiProfileSetProfileKey = (key: string, value: unknown) => api.apiProfileSetProfileKey(invoke, key, value);
export const apiProfileInitGameService = (path?: string) => api.apiProfileInitGameService(invoke, path);

exposeApis({
	apiProfileGetProfile,
	apiProfileGetProfileKey,
	apiProfileSetProfileKey,
	apiProfileInitGameService,
});
