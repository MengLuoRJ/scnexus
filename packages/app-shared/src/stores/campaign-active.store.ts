import { MetadataInformatedCampaignSet } from "scnexus-standard/metadata";

export type CampaignActiveStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_SET: MetadataInformatedCampaignSet;
};
