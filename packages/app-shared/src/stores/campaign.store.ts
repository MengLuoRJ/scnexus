import type { MetadataInformatedCampaignListSet } from 'scnexus-standard/metadata'

export type CampaignStore = {
  _schemaVersion: number
  _revision: number
  ININTIALIZED: boolean
  LAST_REFRESH_TIME: number
  CAMPAIGN_LIST_SET: MetadataInformatedCampaignListSet
}
