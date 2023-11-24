import { join } from "node:path";
import { app } from "electron";
import Store from "electron-store";
import { CustomizeInformation, CustomizeInformationList } from "@shared/types";

const appDataRoot = app.getPath("userData");

export type CustomizeActiveStore = {
  ININTIALIZED: boolean;
  LAST_REFRESH_TIME: number;
  CUSTOMIZE_LIST: CustomizeInformationList;
};

const defaultProfile: CustomizeActiveStore = {
  ININTIALIZED: false,
  LAST_REFRESH_TIME: new Date().getTime(),
  CUSTOMIZE_LIST: [],
};

const customizeActiveStore = new Store<CustomizeActiveStore>({
  name: "customize-active",
  cwd: join(appDataRoot, "SCNexusStorage"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export function updateCustomizeStore(
  newStoreData: CustomizeInformationList
): CustomizeActiveStore {
  customizeActiveStore.set("CUSTOMIZE_LIST", newStoreData);
  customizeActiveStore.set("LAST_REFRESH_TIME", new Date().getTime());
  const ININTIALIZED = customizeActiveStore.get("ININTIALIZED");
  if (!ININTIALIZED) {
    customizeActiveStore.set("ININTIALIZED", true);
  }
  return customizeActiveStore.store;
}

export function getCustomizeActiveStore(): CustomizeActiveStore {
  return customizeActiveStore.store;
}

export function getCustomizeActiveStoreKey<
  T extends keyof CustomizeActiveStore
>(key: T): CustomizeActiveStore[T] {
  return customizeActiveStore.get(key);
}

export function insertActiveCustomize(customize: CustomizeInformation) {
  const storeData: CustomizeInformationList = [];
  const store = getCustomizeActiveStore();
  if (store.ININTIALIZED) storeData.push(...store.CUSTOMIZE_LIST);
  storeData.push(customize);
  updateCustomizeStore(storeData);
}

export function removeActiveCustomize(customize: CustomizeInformation) {
  const storeData: CustomizeInformationList = [];
  const store = getCustomizeActiveStore();
  if (!store.ININTIALIZED) return;
  storeData.push(...store.CUSTOMIZE_LIST);
  const rIndex = storeData.findIndex((cst: CustomizeInformation) => {
    if (customize.snid)
      return customize.snid === cst.snid && customize.name === cst.name;
    else return customize.name === cst.name;
  });
  if (rIndex === -1) return;
  storeData.splice(rIndex, 1);
  updateCustomizeStore(storeData);
}
