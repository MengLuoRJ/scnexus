export function openExternalWebsite(link: string) {
  return window.ipcRenderer.invoke("shell::open-external-website", link);
}

export function openPath(path: string) {
  return window.ipcRenderer.invoke("shell::open-path", path);
}

export function showItemInFolder(path: string) {
  return window.ipcRenderer.invoke("shell::show-item-in-folder", path);
}
