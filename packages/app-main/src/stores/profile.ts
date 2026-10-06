import { join } from "node:path";
import type { ProfileStore } from "@scnexus/app-shared/stores/profile.store";
import { createRepository, invalidData } from "./store-repository";
import { migrateLegacy } from "./store-validation";
import { versionSchema, stringSchema } from "./store-schema";
import type { Schema } from "electron-store";

export function createProfileDefaults(documentRoot: string): ProfileStore {
  return {
    _schemaVersion: 1,
    _revision: 0,
    SUCCESS: false,
    PATH_WHITE_LIST: [],
    PROFILE_GAME: {
      GAME_ROOT: "",
      GAME_VERSION: "5.0.11.90136",
      GAME_CLIENT: "StarCraft II.exe",
      GAME_EXECUTABLE_X64: "SC2Switcher_x64.exe",
      GAME_EDITOR_EXECUTABLE_X64: "SC2Editor_x64.exe",
      GAME_MODS_PATH: "",
      GAME_MAPS_PATH: "",
    },
    PROFILE_DOCUMENTS: {
      DOCUMENTS_ROOT: join(documentRoot, "StarCraft II"),
      DOCUMENTS_LOCAL_BANKS_ROOT: "Banks",
      DOCUMENTS_ARCADE_BANKS_ROOT: "ArcadeBanks",
    },
    PROFILE_CAMPAIGN: {
      LIBRARY_ROOT: "SCNexusCampaign",
      CCM_ROOT: join("Maps", "CustomCampaigns"),
      MODS_ROOT: "Mods",
      MAPS_ROOT: "Maps",
      WOL_ROOT: "Campaign",
      HOTS_ROOT: join("Campaign", "swarm"),
      HOTS_EVO_ROOT: join("Campaign", "swarm", "evolution"),
      LOTV_ROOT: join("Campaign", "void"),
      LOTV_PRO_ROOT: join("Campaign", "voidprologue"),
      NCO_ROOT: join("Campaign", "nova"),
    },
    PROFILE_CUSTOMIZE: {
      LIBRARY_ROOT: "SCNexusCustomize",
      MODS_ROOT: "Mods",
      MAPS_ROOT: "Maps",
    },
  };
}

export function createProfileRepository(documentRoot: () => string) {
  const defaults = createProfileDefaults("");
  const sections = Object.fromEntries(
    [
      "PROFILE_GAME",
      "PROFILE_DOCUMENTS",
      "PROFILE_CAMPAIGN",
      "PROFILE_CUSTOMIZE",
    ].map((key) => {
      const fields = Object.keys(
        defaults[key as keyof typeof defaults] as object,
      );
      return [
        key,
        {
          type: "object",
          additionalProperties: false,
          required: fields,
          properties: Object.fromEntries(
            fields.map((field) => [field, stringSchema]),
          ),
        },
      ];
    }),
  );
  return createRepository<ProfileStore>({
    defaults: () => createProfileDefaults(documentRoot()),
    schema: {
      ...versionSchema,
      ...sections,
      SUCCESS: { type: "boolean" },
      ERROR_MESSAGE: stringSchema,
      PATH_WHITE_LIST: { type: "array", items: stringSchema },
    } as Schema<ProfileStore>,
    optionalKeys: ["ERROR_MESSAGE", "PATH_WHITE_LIST"],
    validate() {},
    migrate: migrateLegacy,
  });
}

let documents: string | undefined;
export function configureProfileDefaults(documentRoot: string) {
  documents = documentRoot;
}
export const profileRepository = createProfileRepository(() => {
  if (documents === undefined)
    invalidData("Documents directory is not initialized");
  return documents;
});
export const profileStore = {
  get: profileRepository.getKey,
  set: profileRepository.updateKey,
  get store() {
    return profileRepository.getSnapshot();
  },
};
export const profileStoreFunction = {
  get: profileStore.get,
  set: profileStore.set,
};
export const getProfileStore = profileRepository.getSnapshot;
export const getProfileStoreKey = profileRepository.getKey;
export const updateProfileStore = profileRepository.update;
