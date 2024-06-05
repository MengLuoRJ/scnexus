import { CampaignType, MetadataInformated } from "scnexus-standard/metadata";
import { useIpcRendererInvoke } from "./ipc-util";
import {
  CampaignActiveStore,
  CampaignStore,
  ResultUncompressCCM,
} from "@shared/types/campaign.type";

const moduleChannel = "campaign";

export const ipcCampaign = {
  unzipCompressFileCCM: (path: string) =>
    useIpcRendererInvoke<ResultUncompressCCM>(
      `${moduleChannel}:unzip-compress-file-ccm`,
      path
    ),
  unzipCompressFileSimulateCCM: (path: string) =>
    useIpcRendererInvoke<ResultUncompressCCM>(
      `${moduleChannel}:unzip-compress-file-simulate-ccm`,
      path
    ),

  getCampaignLists: () =>
    useIpcRendererInvoke<CampaignStore>(`${moduleChannel}:get-campaign-lists`),
  updateCampaignLists: () =>
    useIpcRendererInvoke<CampaignStore>(
      `${moduleChannel}:update-campaign-lists`
    ),
  uninstallCampiagnFiles: (infor: MetadataInformated) =>
    useIpcRendererInvoke<void>(
      `${moduleChannel}:uninstall-campaign-files`,
      infor
    ),

  getActivedCampaignList: () =>
    useIpcRendererInvoke<CampaignActiveStore>(
      `${moduleChannel}:get-actived-campaign-list`
    ),
  getActivedCampaignTyped: (type: CampaignType) =>
    useIpcRendererInvoke<MetadataInformated>(
      `${moduleChannel}:get-actived-campaign-typed`,
      type
    ),
  updateActivedCampaignSet: () =>
    useIpcRendererInvoke<CampaignActiveStore>(
      `${moduleChannel}:update-actived-campaign-set`
    ),

  activeCampaign: (infor: MetadataInformated) =>
    useIpcRendererInvoke<void>(`${moduleChannel}:active-campaign`, infor),
  unactiveCampaign: (infor: MetadataInformated) =>
    useIpcRendererInvoke<void>(`${moduleChannel}:unactive-campaign`, infor),
  recoverCampaignType: (campaign: CampaignType) =>
    useIpcRendererInvoke<void>(
      `${moduleChannel}:recover-campaign-type`,
      campaign
    ),
};
