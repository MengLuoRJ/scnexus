import { bridgeRequest } from "./internal/bridge";
export const apiShellOpenExternalWebsite = (url: string) =>
  bridgeRequest<void>("shell:open-external-website", url);
export const apiShellOpenPath = (path: string) =>
  bridgeRequest<string | undefined>("shell:open-path", path);
export const apiShellShowItemInFolder = (path: string) =>
  bridgeRequest<void>("shell:show-item-in-folder", path);
