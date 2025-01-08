import * as api from "@scnexus/app-shared/ipc/campaign";
import { exposeApis, invoke } from "./common.js";

export const apiCampaignUnzipCompressFileCCM = (path: string) =>
  api.apiCampaignUnzipCompressFileCCM(invoke, path);
export const apiCampaignUnzipCompressFileSimulateCCM = (path: string) =>
  api.apiCampaignUnzipCompressFileSimulateCCM(invoke, path);
export const apiCampaignUnzipCompressFile7zSimulateCCM = (path: string) =>
  api.apiCampaignUnzipCompressFile7zSimulateCCM(invoke, path);
export const apiCampaignGetCampaignLists = () =>
  api.apiCampaignGetCampaignLists(invoke);
export const apiCampaignUpdateCampaignLists = () =>
  api.apiCampaignUpdateCampaignLists(invoke);
export const apiCampaignUninstallCampaignFiles = (info: unknown) =>
  api.apiCampaignUninstallCampaignFiles(invoke, info);
export const apiCampaignGetActivedCampaignList = () =>
  api.apiCampaignGetActivedCampaignList(invoke);
export const apiCampaignGetActivedCampaignTyped = (type: string) =>
  api.apiCampaignGetActivedCampaignTyped(invoke, type);
export const apiCampaignUpdateActivedCampaignSet = () =>
  api.apiCampaignUpdateActivedCampaignSet(invoke);
export const apiCampaignActiveCampaign = (info: unknown) =>
  api.apiCampaignActiveCampaign(invoke, info);
export const apiCampaignUnactiveCampaign = (info: unknown) =>
  api.apiCampaignUnactiveCampaign(invoke, info);
export const apiCampaignRecoverCampaignType = (type: string) =>
  api.apiCampaignRecoverCampaignType(invoke, type);

exposeApis({
  apiCampaignUnzipCompressFileCCM,
  apiCampaignUnzipCompressFileSimulateCCM,
  apiCampaignUnzipCompressFile7zSimulateCCM,
  apiCampaignGetCampaignLists,
  apiCampaignUpdateCampaignLists,
  apiCampaignUninstallCampaignFiles,
  apiCampaignGetActivedCampaignList,
  apiCampaignGetActivedCampaignTyped,
  apiCampaignUpdateActivedCampaignSet,
  apiCampaignActiveCampaign,
  apiCampaignUnactiveCampaign,
  apiCampaignRecoverCampaignType,
});
