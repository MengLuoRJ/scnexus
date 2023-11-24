import { initProfile } from "../stores/profile";
import { initCampaignService } from "./campaign/camapign.service";
import { destroyCustomizeService, initCustomizeService } from "./customize/customize.service";
import { initCampaignIpc } from "./campaign/campaign.ipc";
import { initCustomizeIpc } from "./customize/customize.ipc";
import { initSettingIpc } from "./setting/setting.ipc";
import { BrowserWindow } from "electron";

async function initIpcService() {
  initSettingIpc();
  initCampaignIpc();
  initCustomizeIpc();
}

export async function initService(win: BrowserWindow) {
  // init stores
  await initProfile();

  // init services
  initCustomizeService(win);
  initCampaignService();

  // init ipc
  await initIpcService();
}

export async function destroyService() {
  destroyCustomizeService();
}

