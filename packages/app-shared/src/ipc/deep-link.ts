import type { ApiListener, ApiSubscribe } from "./types";

export const apiDeeplinkOnAuthentication = (
  subscribe: ApiSubscribe,
  listener: ApiListener,
) => subscribe("deeplink:authentication", listener);
