import { versionSchema, stringSchema } from "./store-schema";
import { randomUUID } from "node:crypto";
import type {
  SettingData,
  LegacySettingStore,
} from "@scnexus/app-shared/stores/setting.store";
import { createRepository, invalidData } from "./store-repository";
import { bool, directory, keys, record, text, time } from "./store-validation";

export function createSettingRepository(downloadDirectory: () => string) {
  function validate(value: unknown): asserts value is SettingData {
    const data = record(value);
    if (typeof data.clientId !== "string" || !data.clientId.trim())
      invalidData("Missing client ID");
    directory(data.downloadDirectory);
  }
  return createRepository<SettingData>({
    defaults: () => ({
      _schemaVersion: 1,
      _revision: 0,
      clientId: randomUUID(),
      lastUpdatedAt: null,
      _lastConfirmedVersion: null,
      downloadDirectory: downloadDirectory(),
      displayLanguage: "system",
      logLevel: "error",
      telemetryEnabled: false,
    }),
    schema: {
      ...versionSchema,
      clientId: { ...stringSchema, minLength: 1 },
      lastUpdatedAt: { type: ["number", "null"], minimum: 0 },
      _lastConfirmedVersion: {
        type: ["string", "null"],
        pattern: "^[^\\u0000]*$",
      },
      downloadDirectory: stringSchema,
      displayLanguage: {
        type: "string",
        enum: ["system", "zh-CN", "en-US", "zh-TW"],
      },
      logLevel: {
        type: "string",
        enum: ["error", "warn", "info", "verbose", "debug", "silly"],
      },
      telemetryEnabled: { type: "boolean" },
    },
    validate,
    migrate(legacy, defaults) {
      const data = record(legacy);
      keys(data, [
        "IS_INITIAL",
        "CLIENT_ID",
        "DOWNLOAD_FOLDER",
        "LAST_UPDATED_TIME",
        "PRESETS",
      ]);
      if (data.IS_INITIAL !== undefined) bool(data.IS_INITIAL);
      if (
        data.LAST_UPDATED_TIME !== undefined &&
        data.LAST_UPDATED_TIME !== null
      )
        time(data.LAST_UPDATED_TIME);
      if (data.PRESETS !== undefined) text(data.PRESETS);
      return {
        ...defaults,
        clientId:
          data.CLIENT_ID === undefined
            ? defaults.clientId
            : (data.CLIENT_ID as string),
        downloadDirectory:
          data.DOWNLOAD_FOLDER === undefined
            ? defaults.downloadDirectory
            : (data.DOWNLOAD_FOLDER as string),
      };
    },
  });
}

let downloads: string | undefined;
export const settingRepository = createSettingRepository(() => {
  if (downloads === undefined)
    invalidData("Downloads directory is not initialized");
  return downloads;
});
export function configureSettingDefaults(downloadDirectory: string) {
  downloads = downloadDirectory;
}

const legacyKeys = {
  CLIENT_ID: "clientId",
  DOWNLOAD_FOLDER: "downloadDirectory",
  LAST_UPDATED_TIME: "lastUpdatedAt",
} as const;
type CompatibilitySetting = SettingData & LegacySettingStore;
let legacyInitialized = true;
export const settingStore = {
  get<K extends keyof CompatibilitySetting>(key: K): CompatibilitySetting[K] {
    return this.store[key];
  },
  set<K extends keyof CompatibilitySetting>(
    key: K,
    value: CompatibilitySetting[K],
  ): void {
    if (key === "IS_INITIAL") {
      bool(value);
      // This retired flag is compatibility state, not a persisted preference.
      settingRepository.getSnapshot();
      legacyInitialized = value as boolean;
      return;
    }
    if (key === "PRESETS")
      invalidData(
        "Legacy presets are preserved in the migration backup and are not supported settings",
      );
    const canonicalKey = Object.hasOwn(legacyKeys, key)
      ? legacyKeys[key as keyof typeof legacyKeys]
      : key;
    settingRepository.updateKey(
      canonicalKey as keyof SettingData,
      value as SettingData[keyof SettingData],
    );
  },
  get store(): CompatibilitySetting {
    const data = settingRepository.getSnapshot();
    return {
      ...data,
      IS_INITIAL: legacyInitialized,
      CLIENT_ID: data.clientId,
      DOWNLOAD_FOLDER: data.downloadDirectory,
      LAST_UPDATED_TIME: data.lastUpdatedAt,
    };
  },
};
export const settingStoreFunction = {
  get: settingStore.get.bind(settingStore),
  set: settingStore.set.bind(settingStore),
};
export const getSettingStore = settingRepository.getSnapshot;
export const getSettingStoreKey = settingRepository.getKey;
export const updateSettingStore = settingRepository.update;
