import { versionSchema, stringSchema } from './store-schema'
import { randomUUID } from 'node:crypto'
import type { SettingData } from '@scnexus/app-shared/stores/setting.store'
import { createRepository, invalidData } from './store-repository'
import { bool, directory, keys, record, text, time } from './store-validation'

export function createSettingRepository(downloadDirectory: () => string) {
  function validate(value: unknown): asserts value is SettingData {
    const data = record(value)
    if (typeof data.clientId !== 'string' || !data.clientId.trim()) invalidData('Missing client ID')
    directory(data.downloadDirectory)
    if (data.starCraftDocumentsDirectory !== '') directory(data.starCraftDocumentsDirectory)
    if (data.updateChannel !== 'stable' && data.updateChannel !== 'snapshot')
      invalidData('Invalid update channel')
    bool(data.officialServicesEnabled)
    bool(data.weeklyMutationCalibrationEnabled)
    bool(data.aiAssistantEnabled)
    bool(data.aiAutoApproveSwitchCampaign)
    bool(data.aiAutoApproveRestoreCampaign)
    bool(data.aiAutoApproveUninstallCampaign)
    if (
      !Number.isInteger(data.aiAssistantPort) ||
      (data.aiAssistantPort as number) < 1024 ||
      (data.aiAssistantPort as number) > 65535
    )
      invalidData('Invalid AI assistant port')
  }
  return createRepository<SettingData>({
    defaults: () => ({
      _schemaVersion: 9,
      _revision: 0,
      clientId: randomUUID(),
      lastUpdatedAt: null,
      _lastConfirmedVersion: null,
      downloadDirectory: downloadDirectory(),
      starCraftDocumentsDirectory: '',
      updateChannel: 'stable',
      displayLanguage: 'system',
      logLevel: 'error',
      telemetryEnabled: false,
      analyticsEnabled: true,
      officialServicesEnabled: true,
      weeklyMutationCalibrationEnabled: true,
      workshopEnabled: true,
      aiAssistantEnabled: false,
      aiAssistantPort: 17861,
      aiAutoApproveSwitchCampaign: false,
      aiAutoApproveRestoreCampaign: false,
      aiAutoApproveUninstallCampaign: false,
    }),
    schema: {
      ...versionSchema,
      _schemaVersion: { const: 9 },
      updateChannel: { type: 'string', enum: ['stable', 'snapshot'] },
      clientId: { ...stringSchema, minLength: 1 },
      lastUpdatedAt: { type: ['number', 'null'], minimum: 0 },
      _lastConfirmedVersion: {
        type: ['string', 'null'],
        pattern: '^[^\\u0000]*$',
      },
      downloadDirectory: stringSchema,
      starCraftDocumentsDirectory: stringSchema,
      displayLanguage: {
        type: 'string',
        enum: ['system', 'zh', 'en', 'zh-Hant'],
      },
      logLevel: {
        type: 'string',
        enum: ['error', 'warn', 'info', 'verbose', 'debug', 'silly'],
      },
      telemetryEnabled: { type: 'boolean' },
      analyticsEnabled: { type: 'boolean' },
      officialServicesEnabled: { type: 'boolean' },
      weeklyMutationCalibrationEnabled: { type: 'boolean' },
      workshopEnabled: { type: 'boolean' },
      aiAssistantEnabled: { type: 'boolean' },
      aiAutoApproveSwitchCampaign: { type: 'boolean' },
      aiAutoApproveRestoreCampaign: { type: 'boolean' },
      aiAutoApproveUninstallCampaign: { type: 'boolean' },
      aiAssistantPort: { type: 'integer', minimum: 1024, maximum: 65535 },
    },
    validate,
    migrate(legacy, defaults) {
      const data = record(legacy)
      if ([1, 2, 3, 4, 5, 6, 7, 8].includes(data._schemaVersion as number))
        data.updateChannel = defaults.updateChannel
      if (data._schemaVersion === 8)
        return { ...data, _schemaVersion: defaults._schemaVersion } as SettingData
      if ([1, 2, 3, 4, 5, 6, 7].includes(data._schemaVersion as number))
        data.starCraftDocumentsDirectory = defaults.starCraftDocumentsDirectory
      if (data._schemaVersion === 7)
        return { ...data, _schemaVersion: defaults._schemaVersion } as SettingData
      if ([1, 2, 3, 4, 5, 6].includes(data._schemaVersion as number)) {
        data.aiAutoApproveSwitchCampaign = false
        data.aiAutoApproveRestoreCampaign = false
        data.aiAutoApproveUninstallCampaign = false
      }
      if (data._schemaVersion === 6)
        return { ...data, _schemaVersion: defaults._schemaVersion } as SettingData
      if ([1, 2, 3, 4, 5].includes(data._schemaVersion as number)) {
        data.aiAssistantEnabled = defaults.aiAssistantEnabled
        data.aiAssistantPort = defaults.aiAssistantPort
      }
      if (data._schemaVersion === 5)
        return { ...data, _schemaVersion: defaults._schemaVersion } as SettingData
      if ([1, 2, 3, 4].includes(data._schemaVersion as number)) {
        data.officialServicesEnabled = defaults.officialServicesEnabled
        data.weeklyMutationCalibrationEnabled = defaults.weeklyMutationCalibrationEnabled
      }
      if (data._schemaVersion === 4)
        return { ...data, _schemaVersion: defaults._schemaVersion } as SettingData
      if (data._schemaVersion === 3)
        return {
          ...data,
          _schemaVersion: defaults._schemaVersion,
          workshopEnabled: true,
        } as SettingData
      if (data._schemaVersion === 2) {
        return {
          ...data,
          _schemaVersion: defaults._schemaVersion,
          analyticsEnabled: defaults.analyticsEnabled,
          workshopEnabled: true,
        } as SettingData
      }
      if (data._schemaVersion === 1) {
        const languages: Record<string, string> = {
          'zh-CN': 'zh',
          'en-US': 'en',
          'zh-TW': 'zh-Hant',
        }
        return {
          ...data,
          _schemaVersion: defaults._schemaVersion,
          displayLanguage: languages[data.displayLanguage as string] ?? data.displayLanguage,
          analyticsEnabled: defaults.analyticsEnabled,
          workshopEnabled: true,
        } as SettingData
      }
      keys(data, ['IS_INITIAL', 'CLIENT_ID', 'DOWNLOAD_FOLDER', 'LAST_UPDATED_TIME', 'PRESETS'])
      if (data.IS_INITIAL !== undefined) bool(data.IS_INITIAL)
      if (data.LAST_UPDATED_TIME !== undefined && data.LAST_UPDATED_TIME !== null)
        time(data.LAST_UPDATED_TIME)
      if (data.PRESETS !== undefined) text(data.PRESETS)
      return {
        ...defaults,
        clientId: data.CLIENT_ID === undefined ? defaults.clientId : (data.CLIENT_ID as string),
        downloadDirectory:
          data.DOWNLOAD_FOLDER === undefined
            ? defaults.downloadDirectory
            : (data.DOWNLOAD_FOLDER as string),
      }
    },
  })
}

let downloads: string | undefined
export const settingRepository = createSettingRepository(() => {
  if (downloads === undefined) invalidData('Downloads directory is not initialized')
  return downloads
})
export function configureSettingDefaults(downloadDirectory: string) {
  downloads = downloadDirectory
}

export const getSettingStore = settingRepository.getSnapshot
export const getSettingStoreKey = settingRepository.getKey
export const updateSettingStore = settingRepository.update
