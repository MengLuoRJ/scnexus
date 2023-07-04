import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import { CampaignInformationList } from "../types";

const appDataRoot = app.getPath("userData");

export type CampaignStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CAMPAIGN_LIST: CampaignInformationList;
};

const defaultProfile: CampaignStore = {
  ININTIALIZED: false,
  LAST_REFRESH_TIME: new Date().getTime(),
  CAMPAIGN_LIST: {
    WOL: [],
    HOTS: [],
    LOTV: [],
    NCO: [],
  },
};

const campaignStore = new Store<CampaignStore>({
  name: "campaigns",
  cwd: join(appDataRoot, "profile"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export function updateCampaignStore(
  newStoreData: CampaignInformationList
): CampaignStore {
  campaignStore.set("CAMPAIGN_LIST", newStoreData);
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
