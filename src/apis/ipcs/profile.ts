import { ProfileStore } from "@shared/types/profile";
import { useIpcRendererInvoke } from "./ipc-util";

const moduleChannel = "profile";

export const ipcProfile = {
  getProfile: () =>
    useIpcRendererInvoke<ProfileStore>(`${moduleChannel}:get-profile`),
  getProfileKey: (key: keyof ProfileStore) =>
    useIpcRendererInvoke<ProfileStore[keyof ProfileStore]>(
      `${moduleChannel}:get-profile-key`,
      key
    ),
  setProfileKey: (
    key: keyof ProfileStore,
    value: ProfileStore[keyof ProfileStore]
  ) =>
    useIpcRendererInvoke<void>(`${moduleChannel}:set-profile-key`, key, value),

  initGameService: (path?: string) =>
    useIpcRendererInvoke<ProfileStore>(
      `${moduleChannel}:init-game-service`,
      path
    ),
};
