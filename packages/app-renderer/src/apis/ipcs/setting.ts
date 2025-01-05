import type { SettingStore } from '@scnexus/app-shared/stores/setting.store'
import { useIpcApi } from './ipc-util'

export const apiSettingGetSetting = () =>
  useIpcApi<SettingStore>('apiSettingGetSetting', window.apiSettingGetSetting())
export const apiSettingGetSettingKey = (key: keyof SettingStore) =>
  useIpcApi<SettingStore[keyof SettingStore]>(
    'apiSettingGetSettingKey',
    window.apiSettingGetSettingKey(key),
  )
export const apiSettingSetSettingKey = (
  key: keyof SettingStore,
  value: SettingStore[keyof SettingStore],
) => useIpcApi<void>('apiSettingSetSettingKey', window.apiSettingSetSettingKey(key, value))
export const apiSettingSetTrackerUser = (user: {
  id?: string
  username?: string
  client_id?: string
}) => useIpcApi<void>('apiSettingSetTrackerUser', window.apiSettingSetTrackerUser(user))
