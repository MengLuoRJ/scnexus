import { ipcHandle, ipcHandleTyped } from "../../utils/ipc-util";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import {
  getSettingSnapshot,
  getSettingKey,
  updateSetting,
  updateSettingKey,
} from "./setting";

const legacyKeys: Record<string, string> = {
  CLIENT_ID: "clientId",
  DOWNLOAD_FOLDER: "downloadDirectory",
  LAST_UPDATED_TIME: "lastUpdatedAt",
};
export function initSettingIpc() {
  ipcHandleTyped("setting:get-snapshot", getSettingSnapshot);
  ipcHandleTyped("setting:get-key", getSettingKey);
  ipcHandleTyped("setting:update-key", updateSettingKey);
  ipcHandleTyped("setting:update", updateSetting);
  ipcHandleTyped("setting:replace", (data: unknown) =>
    updateSetting(data, true),
  );
  ipcHandle("setting:get-setting", () => {
    const data = getSettingSnapshot();
    return {
      ...data,
      CLIENT_ID: data.clientId,
      DOWNLOAD_FOLDER: data.downloadDirectory,
      LAST_UPDATED_TIME: data.lastUpdatedAt,
      IS_INITIAL: true,
    };
  });
  ipcHandle("setting:get-setting-key", (key: unknown) => {
    if (key === "IS_INITIAL") return true;
    if (typeof key !== "string")
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    return getSettingKey(legacyKeys[key] ?? key);
  });
  ipcHandle("setting:set-setting-key", (key: unknown, value: unknown) => {
    if (key === "IS_INITIAL") return;
    if (typeof key !== "string")
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    return updateSettingKey(legacyKeys[key] ?? key, value);
  });
  // Retained renderer login callbacks must not change telemetry consent or installation identity.
  ipcHandle("setting:set-tracker-user", () => undefined);
}
