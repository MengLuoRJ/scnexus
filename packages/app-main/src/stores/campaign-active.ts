import type {
  MetadataInformated,
  MetadataInformatedCampaignSet,
  CampaignType,
} from "scnexus-standard/metadata";

import { type CampaignActiveStore } from "@scnexus/app-shared/stores/campaign-active.store";
export { type CampaignActiveStore } from "@scnexus/app-shared/stores/campaign-active.store";

import { createRepository } from "./store-repository";
import { migrateLegacy } from "./store-validation";
import { contentSchema } from "./store-schema";
import type { Schema } from "electron-store";

const defaults = (): CampaignActiveStore => ({
  _schemaVersion: 1,
  _revision: 0,
  ININTIALIZED: false,
  LAST_REFRESH_TIME: 0,
  CAMPAIGN_SET: {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  },
});

export const campaignActiveRepository = createRepository<CampaignActiveStore>({
  defaults,
  schema: contentSchema("CAMPAIGN_SET") as Schema<CampaignActiveStore>,
  validate() {},
  migrate: migrateLegacy,
});

export function updateCampaignActiveStore(
  newCampaignActiveSet: MetadataInformatedCampaignSet,
): CampaignActiveStore {
  return campaignActiveRepository.update({
    ...campaignActiveRepository.getSnapshot(),
    CAMPAIGN_SET: newCampaignActiveSet,
    LAST_REFRESH_TIME: Date.now(),
    ININTIALIZED: true,
  });
}

export function getCampaignActiveStore(): CampaignActiveStore {
  return campaignActiveRepository.getSnapshot();
}

export function getCampaignActiveStoreKey<T extends keyof CampaignActiveStore>(
  key: T,
): CampaignActiveStore[T] {
  return campaignActiveRepository.getKey(key);
}

export function insertStoreActiveCampaign(campaign: MetadataInformated) {
  let storeData: MetadataInformatedCampaignSet = {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  };
  const store = getCampaignActiveStore();
  if (store.ININTIALIZED) {
    storeData = store.CAMPAIGN_SET;
  }
  storeData[campaign.campaign as CampaignType] = campaign;
  updateCampaignActiveStore(storeData);
}

export function removeStoreActiveCampaign(campaign: MetadataInformated) {
  let storeData: MetadataInformatedCampaignSet = {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  };
  const store = getCampaignActiveStore();
  if (store.ININTIALIZED) {
    storeData = store.CAMPAIGN_SET;
  }
  storeData[campaign.campaign as CampaignType] = undefined;
  updateCampaignActiveStore(storeData);
}
