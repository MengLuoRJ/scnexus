import { useIpcRendererInvoke } from "./ipc-util";

const moduleChannel = "shell";

export const ipcShell = {
  openExternalWebsite: (link: string) =>
    useIpcRendererInvoke<string>(
      `${moduleChannel}:open-external-website`,
      link
    ),
  openPath: (path: string) =>
    useIpcRendererInvoke<string>(`${moduleChannel}:open-path`, path),
  showItemInFolder: (path: string) =>
    useIpcRendererInvoke<string>(`${moduleChannel}:show-item-in-folder`, path),
};
