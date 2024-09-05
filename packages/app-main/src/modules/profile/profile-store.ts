import { join } from "node:path";
import { app } from "electron";

import reg from "@/utils/reg";

import { profileStore } from "@/stores/profile";
import { ProfileStore } from "@scnexus/app-shared/stores/profile.store";

import { checkGameRootValid } from "./profile-util";

const documentRoot = app.getPath("documents");

const GAME_REG_PATH_WIN =
  "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StarCraft II";
const GAME_REG_ITEM_WIN = "InstallLocation";

export async function initProfileStore(
  gamePath?: string
): Promise<ProfileStore> {

  console.log("init profile store, " + gamePath);

  // process profile, init or get the existed profile
  const profile = profileStore.store;
  // get the gameRoot to check
  let gameRoot = "";
  if (gamePath) {
    // if the gamePath is provided, start to use and check it
    gameRoot = gamePath;
  } else if (profile.SUCCESS && !!profile.PROFILE_GAME.GAME_ROOT) {
    // if profile is inintialized, check again
    gameRoot = profile.PROFILE_GAME.GAME_ROOT;
  } else if (process.platform === "win32") {
    // standard process to get the game root for win32 platform
    try {
      gameRoot = (
        await reg
          .list([GAME_REG_PATH_WIN])
          .then((data) => data[GAME_REG_PATH_WIN])
      ).values[GAME_REG_ITEM_WIN].value as string;
    } catch (e) {
      profileStore.set("SUCCESS", false);
      profileStore.set("ERROR_MESSAGE", "GAME_ROOT_NOT_FOUND");
      return profileStore.store;
    }
  } else if (process.platform === "darwin") {
    // standard process to get the game root for darwin platform
    // TODO: add darwin platform support
    profileStore.set("SUCCESS", false);
    profileStore.set("ERROR_MESSAGE", "UNSUPPORTED_PLATFORM");
    return profileStore.store;
  } else {
    profileStore.set("SUCCESS", false);
    profileStore.set("ERROR_MESSAGE", "FAILED_GET_GAME_ROOT");
    return profileStore.store;
  }
  const valid = await checkGameRootValid(gameRoot);
  console.log("game root valid: " + valid);
  // start to check the game root
  if (valid) {
    profileStore.set("SUCCESS", true);
  } else {
    profileStore.set("SUCCESS", false);
    profileStore.set("ERROR_MESSAGE", "GAME_ROOT_INVALID");
    return profileStore.store;
  }
  // init profile game
  profileStore.set("PROFILE_GAME", {
    GAME_ROOT: gameRoot,
    GAME_VERSION: "5.0.11.90136",
    GAME_CLIENT: join(gameRoot, "StarCraft II.exe"),
    GAME_EXECUTABLE_X64: join(gameRoot, "Support64", "SC2Switcher_x64.exe"),
    GAME_EDITOR_EXECUTABLE_X64: join(
      gameRoot,
      "Support64",
      "SC2Editor_x64.exe"
    ),
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

  profileStore.set("PATH_WHITE_LIST", [
    // save all paths above as white list,
    // used to check if the path is in the white list
    join(gameRoot, "Maps"),
    join(gameRoot, "Mods"),
    join(gameRoot, "SCNexusCampaign"),
    join(gameRoot, "SCNexusCustomize"),
    join(gameRoot, "Maps", "CustomCampaigns"),
    join(gameRoot, "Maps", "Campaign"),
    join(gameRoot, "Maps", "Campaign", "swarm"),
    join(gameRoot, "Maps", "Campaign", "swarm", "evolution"),
    join(gameRoot, "Maps", "Campaign", "void"),
    join(gameRoot, "Maps", "Campaign", "voidprologue"),
    join(gameRoot, "Maps", "Campaign", "nova"),
    // join(documentRoot, "StarCraft II"),
    // join(documentRoot, "StarCraft II", "Banks"),
    // join(documentRoot, "StarCraft II", "ArcadeBanks"),
  ]);
  profileStore.set("SUCCESS", true);
  const newProfile = profileStore.store;
  return newProfile;
}
