import type { ApiInvoke } from "./types";

export const apiShellOpenExternalWebsite = (invoke: ApiInvoke, link: string) =>
  invoke("shell:open-external-website", link);
export const apiShellOpenPath = (invoke: ApiInvoke, path: string) =>
  invoke("shell:open-path", path);
export const apiShellShowItemInFolder = (invoke: ApiInvoke, path: string) =>
  invoke("shell:show-item-in-folder", path);
