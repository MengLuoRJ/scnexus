import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import {
  CampaignInformation,
  CampaignInformationSet,
  CampaignType,
} from "@shared/types";

const appDataRoot = app.getPath("userData");

export type CampaignActiveStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_SET: CampaignInformationSet;
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
  name: "campaign-active",
  cwd: join(appDataRoot, "SCNexusStorage"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export function updateCampaignActiveStore(
  newStoreData: CampaignInformationSet
): CampaignActiveStore {
  campaignActiveStore.set("CAMPAIGN_SET", newStoreData);
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

export function insertActiveCampaign(campaign: CampaignInformation) {
  let storeData: CampaignInformationSet = {
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

export function removeActiveCampaign(campaign: CampaignInformation) {
  let storeData: CampaignInformationSet = {
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
