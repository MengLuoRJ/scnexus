import { join } from "node:path";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import { createElectronBackend } from "./store-electron-backend";
import { settingRepository, configureSettingDefaults } from "./setting";
import { profileRepository, configureProfileDefaults } from "./profile";
import { campaignRepository } from "./campaign";
import { campaignActiveRepository } from "./campaign-active";
import { customizeRepository } from "./customize";

let initialization: Promise<void> | undefined;

/** Must be awaited after app.whenReady(), before starting business modules. */
export function initAllStores(): Promise<void> {
  initialization ??= initialize().catch((cause) => {
    initialization = undefined;
    throw cause;
  });
  return initialization;
}

async function initialize(): Promise<void> {
  const { app } = await import("electron");
  if (!app.isReady())
    throw new AppError(ERRORS.APP_INITIALIZATION_FAILED, {
      message: "Stores require app readiness",
    });
  const directory = join(app.getPath("userData"), "SCNexusStorage");
  configureSettingDefaults(app.getPath("downloads"));
  configureProfileDefaults(app.getPath("documents"));
  const failures: unknown[] = [];
  for (const [name, repository] of [
    ["store-setting", settingRepository],
    ["store-profile", profileRepository],
    ["store-campaign", campaignRepository],
    ["store-campaign-active", campaignActiveRepository],
    ["store-customize", customizeRepository],
  ] as const) {
    try {
      repository.init(await createElectronBackend(name, directory));
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(failures, "Store initialization failed");
}
