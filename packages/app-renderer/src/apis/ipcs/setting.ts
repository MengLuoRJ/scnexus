import type { SettingStore } from '@scnexus/app-shared/stores/setting.store'
import { ipcApi, useIpcApi } from './ipc-util'

export const apiSettingGetSetting = () =>
  useIpcApi<SettingStore>('apiSettingGetSetting', ipcApi['setting:get-setting']())
export const apiSettingGetSettingKey = (key: keyof SettingStore) =>
  useIpcApi<SettingStore[keyof SettingStore]>(
    'apiSettingGetSettingKey',
    ipcApi['setting:get-setting-key'](key),
  )
export const apiSettingSetSettingKey = (
  key: keyof SettingStore,
  value: SettingStore[keyof SettingStore],
) => useIpcApi<void>('apiSettingSetSettingKey', ipcApi['setting:set-setting-key'](key, value))
export const apiSettingSetTrackerUser = (user: {
  id?: string
  username?: string
  client_id?: string
}) => useIpcApi<void>('apiSettingSetTrackerUser', ipcApi['setting:set-tracker-user'](user))
