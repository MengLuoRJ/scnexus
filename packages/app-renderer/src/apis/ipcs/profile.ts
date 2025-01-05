import type { ProfileStore } from '@scnexus/app-shared/stores/profile.store'
import { useIpcApi } from './ipc-util'

export const apiProfileGetProfile = () =>
  useIpcApi<ProfileStore>('apiProfileGetProfile', window.apiProfileGetProfile())
export const apiProfileGetProfileKey = (key: keyof ProfileStore) =>
  useIpcApi<ProfileStore[keyof ProfileStore]>(
    'apiProfileGetProfileKey',
    window.apiProfileGetProfileKey(key),
  )
export const apiProfileSetProfileKey = (
  key: keyof ProfileStore,
  value: ProfileStore[keyof ProfileStore],
) => useIpcApi<void>('apiProfileSetProfileKey', window.apiProfileSetProfileKey(key, value))
export const apiProfileInitGameService = (path?: string) =>
  useIpcApi<ProfileStore>('apiProfileInitGameService', window.apiProfileInitGameService(path))
