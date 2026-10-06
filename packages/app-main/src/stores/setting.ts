import { versionSchema, stringSchema } from "./store-schema";
import { randomUUID } from "node:crypto";
import type { SettingData } from "@scnexus/app-shared/stores/setting.store";
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

export const getSettingStore = settingRepository.getSnapshot;
export const getSettingStoreKey = settingRepository.getKey;
export const updateSettingStore = settingRepository.update;
