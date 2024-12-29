import * as api from "@scnexus/app-shared/ipc/profile";
import { exposeInvoke } from "./common.js";

exposeInvoke("apiProfileGetProfile", api.apiProfileGetProfile);
exposeInvoke("apiProfileGetProfileKey", api.apiProfileGetProfileKey);
exposeInvoke("apiProfileSetProfileKey", api.apiProfileSetProfileKey);
exposeInvoke("apiProfileInitGameService", api.apiProfileInitGameService);