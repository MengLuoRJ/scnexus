export type DisplayLanguage = 'system' | 'zh' | 'en' | 'zh-Hant'
export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug' | 'silly'

export type SettingData = {
  _schemaVersion: number
  _revision: number
  clientId: string
  lastUpdatedAt: number | null
  _lastConfirmedVersion: string | null
  downloadDirectory: string
  displayLanguage: DisplayLanguage
  logLevel: LogLevel
  telemetryEnabled: boolean
  analyticsEnabled: boolean
}

export type LegacySettingStore = {
  IS_INITIAL: boolean
  LAST_UPDATED_TIME: number | null
  CLIENT_ID: string
  DOWNLOAD_FOLDER: string
  PRESETS?: string
}

/** Compatibility contract for the retained renderer. New APIs use SettingData. */
export type SettingStore = LegacySettingStore
