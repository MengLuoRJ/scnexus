import type { MetadataInformatedCampaignSet } from "scnexus-standard/metadata";

export type CampaignActiveStore = {
  _schemaVersion: number;
  _revision: number;
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_SET: MetadataInformatedCampaignSet;
};
