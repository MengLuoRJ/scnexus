import type { ProfileStore } from '@scnexus/app-shared/stores/profile.store'
import { useIpcApi } from './ipc-util'

export const ipcProfile = {
  getProfile: () => useIpcApi<ProfileStore>('apiProfileGetProfile', window.apiProfileGetProfile()),
  getProfileKey: (key: keyof ProfileStore) =>
    useIpcApi<ProfileStore[keyof ProfileStore]>(
      'apiProfileGetProfileKey',
      window.apiProfileGetProfileKey(key),
    ),
  setProfileKey: (key: keyof ProfileStore, value: ProfileStore[keyof ProfileStore]) =>
    useIpcApi<void>('apiProfileSetProfileKey', window.apiProfileSetProfileKey(key, value)),

  initGameService: (path?: string) =>
    useIpcApi<ProfileStore>('apiProfileInitGameService', window.apiProfileInitGameService(path)),
}
