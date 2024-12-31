import type { SettingStore } from '@scnexus/app-shared/stores/setting.store'
import { useIpcApi } from './ipc-util'

export const ipcSetting = {
  getSetting: () => useIpcApi<SettingStore>('apiSettingGetSetting', window.apiSettingGetSetting()),
  getSettingKey: (key: keyof SettingStore) =>
    useIpcApi<SettingStore[keyof SettingStore]>(
      'apiSettingGetSettingKey',
      window.apiSettingGetSettingKey(key),
    ),
  setSettingKey: (key: keyof SettingStore, value: SettingStore[keyof SettingStore]) =>
    useIpcApi<void>('apiSettingSetSettingKey', window.apiSettingSetSettingKey(key, value)),

  setTrackerUser: (user: { id?: string; username?: string; client_id?: string }) =>
    useIpcApi<void>('apiSettingSetTrackerUser', window.apiSettingSetTrackerUser(user)),
}
