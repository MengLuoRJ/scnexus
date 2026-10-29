import type { IpcResult } from '../errors/app.error.js'
import type { SettingData } from '../stores/setting.store.js'

export const LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export type DisplayLanguage = 'system' | 'zh' | 'en' | 'zh-Hant'
export type SettingPreferences = Pick<
  SettingData,
  | 'downloadDirectory'
  | 'displayLanguage'
  | 'logLevel'
  | 'telemetryEnabled'
  | 'analyticsEnabled'
  | 'officialServicesEnabled'
  | 'weeklyMutationCalibrationEnabled'
  | 'workshopEnabled'
>
export type SettingPatchKeys = keyof SettingPreferences
export type WindowStatus = {
  state: 'absent' | 'loading' | 'ready' | 'failed'
  minimized: boolean
  maximized: boolean
}
export type TelemetryStatus = {
  savedEnabled: boolean
  state: 'disabled' | 'starting' | 'enabled' | 'failed'
}
export type LogInput = {
  level: LogLevel
  scope: string
  message: string
  error?: import('../errors/app.error.js').AppErrorDto
  taskId?: string
}
export type SettingSnapshot = SettingData & {
  effectiveLanguage: Exclude<DisplayLanguage, 'system'>
}

export type DeepLinkWorkshop = {
  scnid: number
  /** Requests UI download confirmation only; does not start a download task. */
  download: boolean
}

export interface DesktopApi {
  dependency: import('./content-api.type.js').ContentApi
  workshop: import('./workshop.type.js').WorkshopApi
  auth: import('./auth.type.js').AuthApi
  content: import('./content-api.type.js').ContentAnalysisApi
  campaign: import('./content-api.type.js').CampaignApi
  customize: import('./content-api.type.js').CustomizeApi
  gameSetting: import('./content-api.type.js').GameSettingApi
  app: { getVersion(): Promise<IpcResult<string>>; getDeviceName(): Promise<IpcResult<string>> }
  window: {
    getStatus(): Promise<IpcResult<WindowStatus>>
    show(): Promise<IpcResult<WindowStatus>>
    minimize(): Promise<IpcResult<WindowStatus>>
    setMaximized(maximized: boolean): Promise<IpcResult<WindowStatus>>
    close(): Promise<IpcResult<void>>
    ready(): Promise<IpcResult<WindowStatus>>
    onStatus(listener: (status: WindowStatus) => void): () => void
  }
  setting: {
    getSnapshot(): Promise<IpcResult<SettingSnapshot>>
    getKey<K extends keyof SettingData>(key: K): Promise<IpcResult<SettingData[K]>>
    updateKey<K extends keyof SettingPreferences>(
      key: K,
      value: SettingPreferences[K],
    ): Promise<IpcResult<SettingSnapshot>>
    update(patch: Partial<SettingPreferences>): Promise<IpcResult<SettingSnapshot>>
    replace(preferences: SettingPreferences): Promise<IpcResult<SettingSnapshot>>
    onChanged(listener: (snapshot: SettingSnapshot) => void): () => void
  }
  logging: {
    getConfig(): Promise<IpcResult<{ level: LogLevel }>>
    setLevel(level: LogLevel): Promise<IpcResult<SettingSnapshot>>
    write(input: LogInput): void
  }
  telemetry: {
    getStatus(): Promise<IpcResult<TelemetryStatus>>
    setEnabled(enabled: boolean): Promise<IpcResult<SettingSnapshot>>
    onStatus(listener: (status: TelemetryStatus) => void): () => void
  }
  deepLink: {
    onAuthentication(
      listener: (data: { access_token: string | null; refresh_token: string | null }) => void,
    ): () => void
    onWorkshop(listener: (data: DeepLinkWorkshop) => void): () => void
  }
}
