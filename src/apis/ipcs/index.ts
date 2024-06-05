import { ipcCampaign } from "./campaign";
import { ipcCustomize } from "./customize";
import { ipcApp } from "./app";
import { ipcDialog } from "./dialog";
import { ipcShell } from "./shell";
import { ipcUpdater } from "./updater";
import { ipcDeepLink } from "./deep-link";

export const useIpc = {
  campaign: ipcCampaign,
  customize: ipcCustomize,
  app: ipcApp,
  dialog: ipcDialog,
  shell: ipcShell,
  updater: ipcUpdater,
  deepLink: ipcDeepLink,
};
