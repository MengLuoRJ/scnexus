import type {
  MetadataInformated,
  MetadataInformatedList,
} from "scnexus-standard/metadata";

import type { CustomizeStore } from "@scnexus/app-shared/stores/customize.store";

import { createRepository } from "./store-repository";
import { migrateLegacy } from "./store-validation";
import { contentSchema } from "./store-schema";
import type { Schema } from "electron-store";

const defaults = (): CustomizeStore => ({
  _schemaVersion: 1,
  _revision: 0,
  ININTIALIZED: false,
  LAST_REFRESH_TIME: 0,
  CUSTOMIZE_LIST: [],
});

export const customizeRepository = createRepository<CustomizeStore>({
  defaults,
  schema: contentSchema("CUSTOMIZE_LIST") as Schema<CustomizeStore>,
  validate() {},
  migrate: migrateLegacy,
});

export function updateCustomizeStore(
  newCustomizeList: MetadataInformatedList,
): CustomizeStore {
  return customizeRepository.update({
    ...customizeRepository.getSnapshot(),
    CUSTOMIZE_LIST: newCustomizeList,
    LAST_REFRESH_TIME: Date.now(),
    ININTIALIZED: true,
  });
}

export function getCustomizeStore(): CustomizeStore {
  return customizeRepository.getSnapshot();
}

export function getCustomizeStoreKey<T extends keyof CustomizeStore>(
  key: T,
): CustomizeStore[T] {
  return customizeRepository.getKey(key);
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
