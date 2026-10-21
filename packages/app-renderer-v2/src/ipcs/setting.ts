import { ipcDesktop, ipcRequest, ipcSnapshot, ipcSubscription } from './internal/ipc-common'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'
import type { SettingData } from '@scnexus/app-shared/stores/setting.store'
import type { SettingPreferences } from '@scnexus/app-shared/types/desktop.type'

export const ipcSettingGetSnapshot = () => ipcRequest(() => ipcDesktop().setting.getSnapshot())
export const ipcSettingGetKey = <K extends keyof SettingData>(key: K) =>
  ipcRequest(() => ipcDesktop().setting.getKey(key))
export const ipcSettingUpdateKey = <K extends keyof SettingPreferences>(
  key: K,
  value: SettingPreferences[K],
) => ipcRequest(() => ipcDesktop().setting.updateKey(key, value))
export const ipcSettingUpdate = (patch: Partial<SettingPreferences>) =>
  ipcRequest(() => ipcDesktop().setting.update(ipcSnapshot(patch)))
export const ipcSettingReplace = (preferences: SettingPreferences) =>
  ipcRequest(() => ipcDesktop().setting.replace(ipcSnapshot(preferences)))
export const ipcSettingOnChanged = (listener: Parameters<DesktopApi['setting']['onChanged']>[0]) =>
  ipcSubscription((callback) => ipcDesktop().setting.onChanged(callback), listener)
