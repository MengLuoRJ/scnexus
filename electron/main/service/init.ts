import { ipcMain } from "electron";
import { initProfile, getProfile } from "../stores/profile";
import {
  getActiveCampaignMetadata,
  getActiveCampaignMetadataType,
  getCampaignLists,
  initCampaign,
  updateCampaignLists,
} from "./campaign";

async function initIpcService() {
  ipcMain.handle("getProfile", async () => {
    return getProfile();
  });
  ipcMain.handle("getActiveCampaignMetadata", async () => {
    return getActiveCampaignMetadata();
  });
  ipcMain.handle("getActiveCampaignMetadataType", async (e, type: string) => {
    return getActiveCampaignMetadataType(type as any);
  });
  ipcMain.handle("getCampaignLists", async () => {
    return getCampaignLists();
  });
  ipcMain.handle("updateCampaignLists", async () => {
    return updateCampaignLists();
  });
}

export async function initService() {
  await initProfile();
  initCampaign();
  initIpcService();
}
