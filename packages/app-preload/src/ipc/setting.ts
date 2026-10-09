import { exposeApis, invoke } from '../ipc-common.js'

export const apiSettingGetSetting = () => invoke('setting:get-setting')
export const apiSettingGetSettingKey = (key: string) => invoke('setting:get-setting-key', key)
export const apiSettingSetSettingKey = (key: string, value: unknown) =>
  invoke('setting:set-setting-key', key, value)
export const apiSettingSetTrackerUser = (user: unknown) => invoke('setting:set-tracker-user', user)

exposeApis({
  'setting:get-setting': apiSettingGetSetting,
  'setting:get-setting-key': apiSettingGetSettingKey,
  'setting:set-setting-key': apiSettingSetSettingKey,
  'setting:set-tracker-user': apiSettingSetTrackerUser,
})
