import { join } from "node:path";
import { app } from "electron";
import reg from "../utils/reg";
import Store from "electron-store";
import { CampaignType } from "../types";

const appDataRoot = app.getPath("userData");
const documentRoot = app.getPath("documents");

const GAME_REG_PATH =
  "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StarCraft II";
const GAME_REG_ITEM = "InstallLocation";

export type ProfileGame = {
  GAME_ROOT: string;
  GAME_VERSION: string;
  GAME_EXECUTABLE_X64: string;
  GAME_MODS_PATH: string;
  GAME_MAPS_PATH: string;
};

export type ProfileDocuments = {
  DOCUMENTS_ROOT: string;
  DOCUMENTS_LOCAL_BANKS_ROOT: string;
  DOCUMENTS_ARCADE_BANKS_ROOT: string;
};

export type ProfileCampaign = {
  LIBRARY_ROOT: string;
  CCM_ROOT: string;
  MODS_ROOT: string;
  MAPS_ROOT: string;
  WOL_ROOT: string;
  HOTS_ROOT: string;
  HOTS_EVO_ROOT: string;
  LOTV_ROOT: string;
  LOTV_PRO_ROOT: string;
  NCO_ROOT: string;
};

export type ProfileCustomize = {
  LIBRARY_ROOT: string;
  MODS_ROOT: string;
  MAPS_ROOT: string;
};

export type LocalProfile = {
  LOCAL_ININTIALIZED: boolean;
  PROFILE_GAME: ProfileGame;
  PROFILE_DOCUMENTS: ProfileDocuments;
  PROFILE_CAMPAIGN: ProfileCampaign;
  PROFILE_CUSTOMIZE: ProfileCustomize;
};

const defaultProfile: LocalProfile = {
  LOCAL_ININTIALIZED: false,
  PROFILE_GAME: {
    GAME_ROOT: "",
    GAME_VERSION: "5.0.11.90136",
    GAME_EXECUTABLE_X64: "SC2_x64.exe",
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

const profileStore = new Store<LocalProfile>({
  name: "profile",
  cwd: join(appDataRoot, "profile"),
  fileExtension: "json",
  defaults: defaultProfile,
});

export async function initProfile(): Promise<LocalProfile> {
  // check if the init process need to be done
  const profile = profileStore.store;
  if (profile.LOCAL_ININTIALIZED) {
    return profile;
  }
  // process profile init
  const gameRoot = (
    await reg.list([GAME_REG_PATH]).then((data) => data[GAME_REG_PATH])
  ).values[GAME_REG_ITEM].value as string;
  // init profile game
  profileStore.set("PROFILE_GAME", {
    GAME_ROOT: gameRoot,
    GAME_VERSION: "5.0.11.90136",
    GAME_EXECUTABLE_X64: join(gameRoot, "Support", "SC2Switcher_x64.exe"),
    GAME_MODS_PATH: join(gameRoot, "Mods"),
    GAME_MAPS_PATH: join(gameRoot, "Maps"),
  });
  // init profile documents
  profileStore.set("PROFILE_DOCUMENTS", {
    DOCUMENTS_ROOT: join(documentRoot, "StarCraft II"),
    DOCUMENTS_LOCAL_BANKS_ROOT: join(documentRoot, "StarCraft II", "Banks"),
    DOCUMENTS_ARCADE_BANKS_ROOT: join(
      documentRoot,
      "StarCraft II",
      "ArcadeBanks"
    ),
  });
  // init profile campaign
  profileStore.set("PROFILE_CAMPAIGN", {
    LIBRARY_ROOT: join(gameRoot, "SCNexusCampaign"),
    CCM_ROOT: join(gameRoot, "Maps", "CustomCampaigns"),
    MAPS_ROOT: join(gameRoot, "Maps"),
    MODS_ROOT: join(gameRoot, "Mods"),
    WOL_ROOT: join(gameRoot, "Maps", "Campaign"),
    HOTS_ROOT: join(gameRoot, "Maps", "Campaign", "swarm"),
    HOTS_EVO_ROOT: join(gameRoot, "Maps", "Campaign", "swarm", "evolution"),
    LOTV_ROOT: join(gameRoot, "Maps", "Campaign", "void"),
    LOTV_PRO_ROOT: join(gameRoot, "Maps", "Campaign", "voidprologue"),
    NCO_ROOT: join(gameRoot, "Maps", "Campaign", "nova"),
  });
  // init profile customize
  profileStore.set("PROFILE_CUSTOMIZE", {
    LIBRARY_ROOT: join(gameRoot, "SCNexusCustomize"),
    MAPS_ROOT: join(gameRoot, "Maps"),
    MODS_ROOT: join(gameRoot, "Mods"),
  });
  // process profile data
  profileStore.set("LOCAL_ININTIALIZED", true);
  const newProfile = profileStore.store;
  return newProfile;
}

export function getProfile(): LocalProfile {
  return profileStore.store;
}

export function getProfileKey<T extends keyof LocalProfile>(
  key: T
): LocalProfile[T] {
  return profileStore.get(key);
}

export function getCampaignTypeRoot(type: CampaignType): string | undefined {
  const campaignPaths = getProfileKey("PROFILE_CAMPAIGN");
  const campaignTypeRoot = campaignPaths[`${type}_ROOT`] as string | undefined;
  return campaignTypeRoot ?? undefined;
}
