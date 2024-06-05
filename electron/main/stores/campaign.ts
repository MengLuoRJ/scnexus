import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import {
  MetadataInformated,
  MetadataInformatedCampaignListSet,
  CampaignType,
  MetadataInformatedList,
} from "scnexus-standard/metadata";

const appDataRoot = app.getPath("userData");

export type CampaignStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_LIST_SET: MetadataInformatedCampaignListSet;
};

const defaultProfile: CampaignStore = {
  ININTIALIZED: false,
  LAST_REFRESH_TIME: new Date().getTime(),
  CAMPAIGN_LIST_SET: {
    WOL: [],
    HOTS: [],
    LOTV: [],
    NCO: [],
  },
};

const campaignStore = new Store<CampaignStore>({
  name: "store-campaign",
  cwd: join(appDataRoot, "SCNexusStorage"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export function updateCampaignStore(
  newCampaignListSet: MetadataInformatedCampaignListSet
): CampaignStore {
  campaignStore.set("CAMPAIGN_LIST_SET", newCampaignListSet);
  campaignStore.set("LAST_REFRESH_TIME", new Date().getTime());
  const ININTIALIZED = campaignStore.get("ININTIALIZED");
  if (!ININTIALIZED) {
    campaignStore.set("ININTIALIZED", true);
  }
  return campaignStore.store;
}

export function getCampaignStore(): CampaignStore {
  return campaignStore.store;
}

export function getCampaignStoreKey<T extends keyof CampaignStore>(
  key: T
): CampaignStore[T] {
  return campaignStore.get(key);
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

  storeData.push(campaign);
  store.CAMPAIGN_LIST_SET[campaign.campaign as CampaignType] = storeData;

  updateCampaignStore(store.CAMPAIGN_LIST_SET);
}
