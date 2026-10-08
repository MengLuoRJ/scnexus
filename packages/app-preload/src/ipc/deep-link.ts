import { exposeApis, subscribe, type ApiListener } from "../ipc-common.js";

export const apiDeepLinkOnAuthentication = (listener: ApiListener) =>
  subscribe("deeplink:authentication", listener);

exposeApis({ "deeplink:authentication": apiDeepLinkOnAuthentication });
