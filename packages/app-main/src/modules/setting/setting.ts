import { app } from "electron";
import { gt, valid } from "semver";
import { isAbsolute } from "node:path";
import { stat, access } from "node:fs/promises";
import { constants } from "node:fs";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import type { SettingData } from "@scnexus/app-shared/stores/setting.store";
import type { SettingSnapshot } from "@scnexus/app-shared/types/desktop.type";
import { getSettingStore, updateSettingStore } from "../../stores/setting";
import { applyLogLevel, reportError } from "../logging/logging";
import {
  disableTelemetry,
  enableTelemetry,
  setSavedTelemetryEnabled,
} from "../telemetry/telemetry";
import { getMainWindow, onWindowReady } from "../window/window";
import {
  resolveDisplayLanguage,
  validatePreferencePatch,
} from "./setting-validation";

let pending: Promise<unknown> = Promise.resolve();
let stopReady: (() => void) | undefined;
export function getSettingSnapshot(): SettingSnapshot {
  const data = getSettingStore();
  return {
    ...data,
    effectiveLanguage: resolveDisplayLanguage(
      data.displayLanguage,
      app.getPreferredSystemLanguages(),
    ),
  };
}
export function getSettingKey(key: unknown) {
  const data = getSettingStore();
  if (typeof key !== "string" || !Object.hasOwn(data, key))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
  return data[key as keyof SettingData];
}
function publish() {
  getMainWindow()?.webContents.send("setting:changed", getSettingSnapshot());
}

async function applyUpdate(
  raw: unknown,
  complete: boolean,
): Promise<SettingSnapshot> {
  const patch = validatePreferencePatch(raw, complete);
  if ("downloadDirectory" in patch) {
    const directory = patch.downloadDirectory as string;
    try {
      if (!isAbsolute(directory) || !(await stat(directory)).isDirectory())
        throw new Error("Not a directory");
      await access(directory, constants.W_OK);
    } catch (cause) {
      throw new AppError(
        ERRORS.SETTING_INVALID_VALUE,
        { message: "Download directory must be writable" },
        { cause },
      );
    }
  }
  const previous = getSettingStore();
  const next = { ...previous, ...patch } as SettingData;
  let disableError: unknown;
  if (next.telemetryEnabled === false && "telemetryEnabled" in patch) {
    try {
      await disableTelemetry(previous.telemetryEnabled);
    } catch (error) {
      disableError = error;
    }
  }
  const saved = updateSettingStore(next);
  setSavedTelemetryEnabled(saved.telemetryEnabled);
  if (next.logLevel !== previous.logLevel) {
    try {
      applyLogLevel(next.logLevel);
    } catch (cause) {
      applyLogLevel(previous.logLevel);
      updateSettingStore({
        ...previous,
        ...(next.telemetryEnabled === false ? { telemetryEnabled: false } : {}),
      });
      publish();
      throw new AppError(ERRORS.LOGGING_CONFIGURATION_FAILED, {}, { cause });
    }
  }
  if (saved.telemetryEnabled && "telemetryEnabled" in patch) {
    try {
      enableTelemetry(saved.clientId);
    } catch (error) {
      publish();
      throw error;
    }
  }
  publish();
  if (disableError) throw disableError;
  return getSettingSnapshot();
}
export function updateSetting(
  raw: unknown,
  complete = false,
): Promise<SettingSnapshot> {
  const result = pending.then(() => applyUpdate(raw, complete));
  pending = result.catch(() => {});
  return result;
}
export function updateSettingKey(key: unknown, value: unknown) {
  if (typeof key !== "string") throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
  return updateSetting({ [key]: value });
}
export function initializeSetting() {
  const data = getSettingStore();
  applyLogLevel(data.logLevel);
  if (data.telemetryEnabled) {
    try {
      enableTelemetry(data.clientId);
    } catch (error) {
      reportError(error, "telemetry");
    }
  }
  if (app.isPackaged) {
    const current = app.getVersion();
    if (valid(current) && current !== data._lastConfirmedVersion) {
      updateSettingStore({
        ...data,
        _lastConfirmedVersion: current,
        lastUpdatedAt:
          data._lastConfirmedVersion &&
          valid(data._lastConfirmedVersion) &&
          gt(current, data._lastConfirmedVersion)
            ? Date.now()
            : data.lastUpdatedAt,
      });
    }
  }
  stopReady?.();
  stopReady = onWindowReady(publish);
}
export function disposeSetting() {
  stopReady?.();
  stopReady = undefined;
}
