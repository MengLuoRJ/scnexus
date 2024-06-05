import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import {
  MetadataInformated,
  MetadataInformatedList,
} from "scnexus-standard/metadata";

const appDataRoot = app.getPath("userData");

export type CustomizeStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CUSTOMIZE_LIST: MetadataInformatedList;
};

const defaultProfile: CustomizeStore = {
  ININTIALIZED: false,
  LAST_REFRESH_TIME: new Date().getTime(),
  CUSTOMIZE_LIST: [],
};

const customizeStore = new Store<CustomizeStore>({
  name: "store-customize",
  cwd: join(appDataRoot, "SCNexusStorage"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export function updateCustomizeStore(
  newCustomizeList: MetadataInformatedList
): CustomizeStore {
  customizeStore.set("CUSTOMIZE_LIST", newCustomizeList);
  customizeStore.set("LAST_REFRESH_TIME", new Date().getTime());
  const ININTIALIZED = customizeStore.get("ININTIALIZED");
  if (!ININTIALIZED) {
    customizeStore.set("ININTIALIZED", true);
  }
  return customizeStore.store;
}

export function getCustomizeStore(): CustomizeStore {
  return customizeStore.store;
}

export function getCustomizeStoreKey<T extends keyof CustomizeStore>(
  key: T
): CustomizeStore[T] {
  return customizeStore.get(key);
}

export function insertStoreCustomize(customize: MetadataInformated) {
  const storeData: MetadataInformatedList = [];
  const store = getCustomizeStore();
  if (store.ININTIALIZED) storeData.push(...store.CUSTOMIZE_LIST);
  storeData.push(customize);
  updateCustomizeStore(storeData);
}

export function removeStoreCustomize(customize: MetadataInformated) {
  const storeData: MetadataInformatedList = [];
  const store = getCustomizeStore();
  if (!store.ININTIALIZED) return;
  storeData.push(...store.CUSTOMIZE_LIST);
  const rIndex = storeData.findIndex((cst: MetadataInformated) => {
    if (customize.snid)
      return customize.snid === cst.snid && customize.name === cst.name;
    else return customize.name === cst.name;
  });
  if (rIndex === -1) return;
  storeData.splice(rIndex, 1);
  updateCustomizeStore(storeData);
}
