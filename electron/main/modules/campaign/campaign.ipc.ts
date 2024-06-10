import { ipcHandle, ipcHandleRemove } from "@electron/main/utils/ipc-util";
import {
  unzipCompressFile7zSimulateCCM,
  unzipCompressFileCCM,
  unzipCompressFileSimulateCCM,
} from "./ccm-process";
import {
  getCampaignLists,
  uninstallCampiagnFiles,
  updateCampaignLists,
} from "./campaign-manage";
import {
  activeCampaign,
  getActivedCampaignList,
  getActivedCampaignTyped,
  recoverCampaignType,
  unactiveCampaign,
  updateActivedCampaignSet,
} from "./campaign-active";

export function initCampaignIpc() {
  ipcHandle("campaign:unzip-compress-file-ccm", unzipCompressFileCCM);
  ipcHandle(
    "campaign:unzip-compress-file-simulate-ccm",
    unzipCompressFileSimulateCCM
  );

  ipcHandle(
    "campaign:unzip-compress-file-7z-simulate-ccm",
    unzipCompressFile7zSimulateCCM
  );

  ipcHandle("campaign:get-campaign-lists", getCampaignLists);
  ipcHandle("campaign:update-campaign-lists", updateCampaignLists);
  ipcHandle("campaign:uninstall-campaign-files", uninstallCampiagnFiles);

  ipcHandle("campaign:get-actived-campaign-list", getActivedCampaignList);
  ipcHandle("campaign:get-actived-campaign-typed", getActivedCampaignTyped);
  ipcHandle("campaign:update-actived-campaign-set", updateActivedCampaignSet);

  ipcHandle("campaign:active-campaign", activeCampaign);
  ipcHandle("campaign:unactive-campaign", unactiveCampaign);
  ipcHandle("campaign:recover-campaign-type", recoverCampaignType);
}
