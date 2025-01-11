import { apiDeepLinkOnAuthentication as invokeApiDeepLinkOnAuthentication } from "@scnexus/app-shared/ipc/deep-link";
import { exposeApis, subscribe, type ApiListener } from "./common.js";

export const apiDeepLinkOnAuthentication = (listener: ApiListener) =>
  invokeApiDeepLinkOnAuthentication(subscribe, listener);

exposeApis({ "deeplink:authentication": apiDeepLinkOnAuthentication });
