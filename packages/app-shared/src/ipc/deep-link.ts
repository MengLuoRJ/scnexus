import type { ApiListener, ApiSubscribe } from "./types";

export const apiDeepLinkOnAuthentication = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("deeplink:authentication", listener);
