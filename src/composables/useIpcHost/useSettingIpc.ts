import { LocalProfile } from "@shared/types/profile";

export async function getProfile(): Promise<LocalProfile> {
  const profile = await window.ipcRenderer.invoke("setting::get-profile");
  return profile;
}

export async function initProfile(path?: string): Promise<LocalProfile> {
  const profile = await window.ipcRenderer.invoke(
    "setting::init-profile",
    path
  );
  return profile;
}
