import {
  getProfile,
  initProfile,
  setProfileKey,
  setProfileKeyChild,
} from "@electron/main/stores/profile";
import { LocalProfile } from "@shared/types/profile";
import { initCampaignService } from "../campaign/camapign.service";
import { initCustomizeService } from "../customize/customize.service";

export function getSettingProfile() {
  return getProfile();
}

export async function initSettingProfile(path?: string) {
  const settingProfile = await initProfile(path);
  if (settingProfile?.SUCCESS) {
    initCampaignService();
    initCustomizeService();
  }
  return settingProfile;
}

export function setSettingProfileKey<T extends keyof LocalProfile>(
  key: T,
  value: LocalProfile[T]
): void {
  setProfileKey(key, value);
}

export function setSettingProfileKeyChild<
  T extends keyof LocalProfile,
  K extends keyof LocalProfile[T]
>(key: T, childKey: K, value: LocalProfile[T][K]) {
  setProfileKeyChild(key, childKey, value);
}
