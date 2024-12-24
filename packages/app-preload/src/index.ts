import { contextBridge, ipcRenderer, webUtils } from "electron";

const invokeChannels = new Set([
  "app:get-version",
  "app:is-packaged",
  "app:get-locale",
  "app:get-system-locale",
  "app:get-locale-country-code",
  "app:get-preferred-system-languages",
  "app:get-path",
  "app:get-paths",
  "campaign:unzip-compress-file-ccm",
  "campaign:unzip-compress-file-simulate-ccm",
  "campaign:unzip-compress-file-7z-simulate-ccm",
  "campaign:get-campaign-lists",
  "campaign:update-campaign-lists",
  "campaign:uninstall-campaign-files",
  "campaign:get-actived-campaign-list",
  "campaign:get-actived-campaign-typed",
  "campaign:update-actived-campaign-set",
  "campaign:active-campaign",
  "campaign:unactive-campaign",
  "campaign:recover-campaign-type",
  "customize:read-compress-file-info",
  "customize:install-compress-file",
  "customize:read-compress-file-info-7z",
  "customize:install-compress-file-7z",
  "customize:install-customize",
  "customize:uninstall-customize",
  "customize:get-installed-customize-list",
  "customize:scan-installed-customize-list",
  "customize:run-game-client",
  "customize:run-game-executable",
  "customize:run-editor-executable",
  "dialog:show-open-dialog-sync",
  "dialog:show-open-dialog",
  "profile:get-profile",
  "profile:get-profile-key",
  "profile:set-profile-key",
  "profile:init-game-service",
  "setting:get-setting",
  "setting:get-setting-key",
  "setting:set-setting-key",
  "setting:set-tracker-user",
  "shell:open-external-website",
  "shell:open-path",
  "shell:show-item-in-folder",
  "updater:check-for-updates-and-notify",
  "updater:check-for-updates",
  "updater:download-update",
  "updater:quit-and-install",
  "workshop:get-file-md5",
  "workshop:get-file-md5-wasm",
  "workshop:write-metadata",
  "workshop:upload-compressed-file",
]);

const eventChannels = new Set([
  "deeplink:authentication",
  "updater:checking-for-update",
  "updater:update-available",
  "updater:update-not-available",
  "updater:download-progress",
  "updater:update-downloaded",
  "updater:error",
]);

const ipcRendererExposed = {
  invoke: async (channel: string, ...args: any[]) => {
    if (!invokeChannels.has(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (
    channel: string,
    listener: (event: object, ...args: any[]) => void
  ) => {
    if (!eventChannels.has(channel)) {
      throw new Error(`IPC event not allowed: ${channel}`);
    }
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: any[]) =>
      listener({}, ...args);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld("ipcRenderer", ipcRendererExposed);
contextBridge.exposeInMainWorld("webUtils", {
  getPathForFile: (file: File) => {
    return webUtils.getPathForFile(file);
  },
});
