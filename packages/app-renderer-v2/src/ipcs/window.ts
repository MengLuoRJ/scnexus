import { desktop, request, subscription } from "./internal/ipc-common";
import type { DesktopApi } from "@scnexus/app-shared/types/desktop.type";

export const apiWindowGetStatus = () => request(() => desktop().window.getStatus());
export const apiWindowShow = () => request(() => desktop().window.show());
export const apiWindowMinimize = () => request(() => desktop().window.minimize());
export const apiWindowSetMaximized = (value: boolean) =>
  request(() => desktop().window.setMaximized(value));
export const apiWindowClose = () => request(() => desktop().window.close());
export const apiWindowReady = () => request(() => desktop().window.ready());
export const apiWindowOnStatus = (listener: Parameters<DesktopApi["window"]["onStatus"]>[0]) =>
  subscription((callback) => desktop().window.onStatus(callback), listener);
