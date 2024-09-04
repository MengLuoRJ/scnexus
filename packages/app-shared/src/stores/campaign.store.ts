import { MetadataInformatedCampaignListSet } from "scnexus-standard/metadata";

export type CampaignStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_LIST_SET: MetadataInformatedCampaignListSet;
};
