import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import {
  MetadataInformated,
  MetadataInformatedCampaignSet,
  CampaignType,
} from "scnexus-standard/metadata";

const appDataRoot = app.getPath("userData");

export type CampaignActiveStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_SET: MetadataInformatedCampaignSet;
};

const defaultProfile: CampaignActiveStore = {
  ININTIALIZED: false,
  LAST_REFRESH_TIME: new Date().getTime(),
  CAMPAIGN_SET: {
    WOL: undefined,
    HOTS: undefined,
    LOTV: undefined,
    NCO: undefined,
  },
};

const campaignActiveStore = new Store<CampaignActiveStore>({
  name: "store-campaign-active",
  cwd: join(appDataRoot, "SCNexusStorage"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export function updateCampaignActiveStore(
  newCampaignActiveSet: MetadataInformatedCampaignSet
): CampaignActiveStore {
  campaignActiveStore.set("CAMPAIGN_SET", newCampaignActiveSet);
  campaignActiveStore.set("LAST_REFRESH_TIME", new Date().getTime());
  const ININTIALIZED = campaignActiveStore.get("ININTIALIZED");
  if (!ININTIALIZED) {
    campaignActiveStore.set("ININTIALIZED", true);
  }
  return campaignActiveStore.store;
}

export function getCampaignActiveStore(): CampaignActiveStore {
  return campaignActiveStore.store;
}

export function getCampaignActiveStoreKey<T extends keyof CampaignActiveStore>(
  key: T
): CampaignActiveStore[T] {
  return campaignActiveStore.get(key);
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
  updateCampaignActiveStore(store.CAMPAIGN_SET);
}
