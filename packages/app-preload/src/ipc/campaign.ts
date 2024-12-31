import * as api from "@scnexus/app-shared/ipc/campaign";
import { exposeInvoke } from "./common.js";

exposeInvoke(
  "apiCampaignUnzipCompressFileCCM",
  api.apiCampaignUnzipCompressFileCCM,
);
exposeInvoke(
  "apiCampaignUnzipCompressFileSimulateCCM",
  api.apiCampaignUnzipCompressFileSimulateCCM,
);
exposeInvoke(
  "apiCampaignUnzipCompressFile7zSimulateCCM",
  api.apiCampaignUnzipCompressFile7zSimulateCCM,
);
exposeInvoke("apiCampaignGetCampaignLists", api.apiCampaignGetCampaignLists);
exposeInvoke(
  "apiCampaignUpdateCampaignLists",
  api.apiCampaignUpdateCampaignLists,
);
exposeInvoke(
  "apiCampaignUninstallCampaignFiles",
  api.apiCampaignUninstallCampaignFiles,
);
exposeInvoke(
  "apiCampaignGetActivedCampaignList",
  api.apiCampaignGetActivedCampaignList,
);
exposeInvoke(
  "apiCampaignGetActivedCampaignTyped",
  api.apiCampaignGetActivedCampaignTyped,
);
exposeInvoke(
  "apiCampaignUpdateActivedCampaignSet",
  api.apiCampaignUpdateActivedCampaignSet,
);
exposeInvoke("apiCampaignActiveCampaign", api.apiCampaignActiveCampaign);
exposeInvoke("apiCampaignUnactiveCampaign", api.apiCampaignUnactiveCampaign);
exposeInvoke(
  "apiCampaignRecoverCampaignType",
  api.apiCampaignRecoverCampaignType,
);
