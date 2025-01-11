import type { ProfileStore } from '@scnexus/app-shared/stores/profile.store'
import { ipcApi, useIpcApi } from './ipc-util'

export const apiProfileGetProfile = () =>
  useIpcApi<ProfileStore>('apiProfileGetProfile', ipcApi['profile:get-profile']())
export const apiProfileGetProfileKey = (key: keyof ProfileStore) =>
  useIpcApi<ProfileStore[keyof ProfileStore]>(
    'apiProfileGetProfileKey',
    ipcApi['profile:get-profile-key'](key),
  )
export const apiProfileSetProfileKey = (
  key: keyof ProfileStore,
  value: ProfileStore[keyof ProfileStore],
) => useIpcApi<void>('apiProfileSetProfileKey', ipcApi['profile:set-profile-key'](key, value))
export const apiProfileInitGameService = (path?: string) =>
  useIpcApi<ProfileStore>('apiProfileInitGameService', ipcApi['profile:init-game-service'](path))
