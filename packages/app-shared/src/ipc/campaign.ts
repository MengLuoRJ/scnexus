import type { ApiInvoke } from "./types";

export const apiCampaignUnzipCompressFileCCM = (
  invoke: ApiInvoke,
  path: string,
) => invoke("campaign:unzip-compress-file-ccm", path);
export const apiCampaignUnzipCompressFileSimulateCCM = (
  invoke: ApiInvoke,
  path: string,
) => invoke("campaign:unzip-compress-file-simulate-ccm", path);
export const apiCampaignUnzipCompressFile7zSimulateCCM = (
  invoke: ApiInvoke,
  path: string,
) => invoke("campaign:unzip-compress-file-7z-simulate-ccm", path);
export const apiCampaignGetCampaignLists = (invoke: ApiInvoke) =>
  invoke("campaign:get-campaign-lists");
export const apiCampaignUpdateCampaignLists = (invoke: ApiInvoke) =>
  invoke("campaign:update-campaign-lists");
export const apiCampaignUninstallCampaignFiles = (
  invoke: ApiInvoke,
  info: unknown,
) => invoke("campaign:uninstall-campaign-files", info);
export const apiCampaignGetActivedCampaignList = (invoke: ApiInvoke) =>
  invoke("campaign:get-actived-campaign-list");
export const apiCampaignGetActivedCampaignTyped = (
  invoke: ApiInvoke,
  type: string,
) => invoke("campaign:get-actived-campaign-typed", type);
export const apiCampaignUpdateActivedCampaignSet = (invoke: ApiInvoke) =>
  invoke("campaign:update-actived-campaign-set");
export const apiCampaignActiveCampaign = (invoke: ApiInvoke, info: unknown) =>
  invoke("campaign:active-campaign", info);
export const apiCampaignUnactiveCampaign = (invoke: ApiInvoke, info: unknown) =>
  invoke("campaign:unactive-campaign", info);
export const apiCampaignRecoverCampaignType = (
  invoke: ApiInvoke,
  type: string,
) => invoke("campaign:recover-campaign-type", type);
