import { ipcMain } from "electron";
import {
  CampaignType,
  CampaignInformation,
  CampaignInformationSet,
} from "@shared/types";
import * as campaignService from "./camapign.service";
import { ResultUncompress } from "@shared/types/customize";

export function initCampaignIpc() {
  ipcMain.handle(
    "campaign::unzip-compress-file-ccm",
    (e, path: string): Promise<ResultUncompress> => {
      return campaignService.unzipCompressFileCCM(path);
    }
  );
  ipcMain.handle(
    "campaign::unzip-compress-file-simulate-ccm",
    (e, path: string): Promise<ResultUncompress> => {
      return campaignService.unzipCompressFileSimulateCCM(path);
    }
  );

  ipcMain.handle(
    "campaign::get-active-campaign",
    (): CampaignInformationSet => {
      return campaignService.getActiveCampaign();
    }
  );

  ipcMain.handle(
    "campaign::get-active-campaign-type",
    (e, campaign: CampaignType) => {
      return campaignService.getActiveCampaignType(campaign);
    }
  );

  ipcMain.handle("campaign::update-active-campaign", () => {
    return campaignService.updateActiveCampaign();
  });

  ipcMain.handle("campaign::update-campaign-lists", () => {
    return campaignService.updateCampaignLists();
  });

  ipcMain.handle("campaign::get-campaign-lists", () => {
    return campaignService.getCampaignLists();
  });

  ipcMain.handle(
    "campaign::active-campaign",
    (e, campaignInformation: CampaignInformation) => {
      return campaignService.activeCampaign(campaignInformation);
    }
  );

  ipcMain.handle(
    "campaign::uninstall-campaign-files",
    (e, campaignInformation: CampaignInformation) => {
      return campaignService.uninstallCampiagnFiles(campaignInformation);
    }
  );

  ipcMain.handle("campaign::clear-campaign-files", (e, path: CampaignType) => {
    campaignService.clearCampaignFiles(path);
  });
}
