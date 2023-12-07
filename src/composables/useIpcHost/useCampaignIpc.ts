import {
  CampaignType,
  CampaignInformation,
  CampaignInformationSet,
} from "@shared/types";
import { CampaignActiveStore, CampaignStore } from "@shared/types/campaign";
import { ResultUncompress } from "@shared/types/customize";

const ipcRenderer = window.ipcRenderer;


export class useCampaignService {
  constructor() {}

  async updateCampaignLists(): Promise<CampaignStore> {
    return window.ipcRenderer.invoke("campaign::update-campaign-lists");
  }
}

export function unzipCompressFileCCM(path: string): Promise<ResultUncompress> {
  return ipcRenderer.invoke("campaign::unzip-compress-file-ccm", path);
}

export function unzipCompressFileSimulateCCM(path: string): Promise<ResultUncompress> {
  return ipcRenderer.invoke("campaign::unzip-compress-file-simulate-ccm", path);
}

export function getActiveCampaign(): Promise<CampaignInformationSet> {
  return ipcRenderer.invoke("campaign::get-active-campaign");
}

export function getActiveCampaignType(campaign: CampaignType) {
  return ipcRenderer.invoke("campaign::get-active-campaign-type", campaign);
}

export function updateActiveCampaign(): Promise<CampaignActiveStore> {
  return ipcRenderer.invoke("campaign::update-active-campaign");
}

export async function updateCampaignLists(): Promise<CampaignStore> {
  return window.ipcRenderer.invoke("campaign::update-campaign-lists");
}

export function getCampaignLists() {
  return ipcRenderer.invoke("campaign::get-campaign-lists");
}

export async function activeCampaign(campaignInformation: CampaignInformation) {
  return window.ipcRenderer.invoke(
    "campaign::active-campaign",
    campaignInformation
  );
}

export async function uninstallCampaignFiles(
  campaignInformation: CampaignInformation
) {
  return ipcRenderer.invoke(
    "campaign::uninstall-campaign-files",
    campaignInformation
  );
}

export async function clearCampaignFiles(campaign: CampaignType) {
  return ipcRenderer.invoke("campaign::clear-campaign-files", campaign);
}
