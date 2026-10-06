import { contextBridge, webUtils } from "electron";
import "./desktop.js";
import "./ipc/app.js";
import "./ipc/campaign.js";
import "./ipc/customize.js";
import "./ipc/deep-link.js";
import "./ipc/dialog.js";
import "./ipc/profile.js";
import "./ipc/setting.js";
import "./ipc/shell.js";
import "./ipc/updater.js";
import "./ipc/workshop.js";

contextBridge.exposeInMainWorld("webUtils", {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
});
