import { desktop, request, subscription } from "./internal/ipc-common";
import type { DesktopApi } from "@scnexus/app-shared/types/desktop.type";

export const apiDeepLinkOnAuthentication = (
  listener: Parameters<DesktopApi["deepLink"]["onAuthentication"]>[0],
) => subscription((callback) => desktop().deepLink.onAuthentication(callback), listener);
export const apiDeepLinkOnWorkshop = (listener: (id: string) => void) =>
  subscription((callback) => desktop().deepLink.onWorkshop(callback), listener);
