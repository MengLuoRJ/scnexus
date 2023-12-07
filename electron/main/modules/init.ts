import { initCampaignIpc } from "./campaign/campaign.ipc";
import { initCustomizeIpc } from "./customize/customize.ipc";
import { initSettingIpc } from "./setting/setting.ipc";
import { initSettingProfile } from "./setting/setting.service";

async function initIpcService() {
  initSettingIpc();
  initCampaignIpc();
  initCustomizeIpc();
}

export async function initService() {
  // init setting profile
  await initSettingProfile();
  // init ipc
  await initIpcService();
}
