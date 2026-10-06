import type {
  MetadataInformated,
  MetadataInformatedCampaignListSet,
  CampaignType,
  MetadataInformatedList,
} from "scnexus-standard/metadata";

import type { CampaignStore } from "@scnexus/app-shared/stores/campaign.store";

import { createRepository } from "./store-repository";
import { migrateLegacy } from "./store-validation";
import { contentSchema } from "./store-schema";
import type { Schema } from "electron-store";

const defaults = (): CampaignStore => ({
  _schemaVersion: 1,
  _revision: 0,
  ININTIALIZED: false,
  LAST_REFRESH_TIME: 0,
  CAMPAIGN_LIST_SET: {
    WOL: [],
    HOTS: [],
    LOTV: [],
    NCO: [],
  },
});

export const campaignRepository = createRepository<CampaignStore>({
  defaults,
  schema: contentSchema("CAMPAIGN_LIST_SET") as Schema<CampaignStore>,
  validate() {},
  migrate: migrateLegacy,
});

export function updateCampaignStore(
  newCampaignListSet: MetadataInformatedCampaignListSet,
): CampaignStore {
  return campaignRepository.update({
    ...campaignRepository.getSnapshot(),
    CAMPAIGN_LIST_SET: newCampaignListSet,
    LAST_REFRESH_TIME: Date.now(),
    ININTIALIZED: true,
  });
}

export function getCampaignStore(): CampaignStore {
  return campaignRepository.getSnapshot();
}

export function getCampaignStoreKey<T extends keyof CampaignStore>(
  key: T,
): CampaignStore[T] {
  return campaignRepository.getKey(key);
}

export function insertStoreCampaign(campaign: MetadataInformated) {
  const storeData: MetadataInformatedList = [];
  const store = getCampaignStore();
  if (store.ININTIALIZED) {
    const oldList = store.CAMPAIGN_LIST_SET[campaign.campaign as CampaignType];
    if (oldList) storeData.push(...oldList);
  }
  storeData.push(campaign);
  store.CAMPAIGN_LIST_SET[campaign.campaign as CampaignType] = storeData;
  updateCampaignStore(store.CAMPAIGN_LIST_SET);
}

export function removeStoreCampaign(campaign: MetadataInformated) {
  const storeData: MetadataInformatedList = [];
  const store = getCampaignStore();
  if (store.ININTIALIZED) {
    const oldList = store.CAMPAIGN_LIST_SET[campaign.campaign as CampaignType];
    if (oldList) storeData.push(...oldList);
  }

  const rIndex = storeData.findIndex((cpn: MetadataInformated) => {
    if (campaign.snid)
      return campaign.snid === cpn.snid && campaign.name === cpn.name;
    else return campaign.name === cpn.name;
  });
  if (rIndex === -1) return;
  storeData.splice(rIndex, 1);
  store.CAMPAIGN_LIST_SET[campaign.campaign as CampaignType] = storeData;

  updateCampaignStore(store.CAMPAIGN_LIST_SET);
}
