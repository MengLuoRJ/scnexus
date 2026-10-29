import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import {
  LOG_LEVELS,
  type DisplayLanguage,
  type SettingPatchKeys,
} from '@scnexus/app-shared/types/desktop.type'

export const PREFERENCE_KEYS = [
  'downloadDirectory',
  'displayLanguage',
  'logLevel',
  'telemetryEnabled',
  'analyticsEnabled',
  'officialServicesEnabled',
  'weeklyMutationCalibrationEnabled',
  'workshopEnabled',
] as const satisfies readonly SettingPatchKeys[]
export function validatePreferencePatch(raw: unknown, complete = false): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new AppError(ERRORS.SETTING_INVALID_VALUE)
  const patch = raw as Record<string, unknown>
  if (
    Object.keys(patch).some(
      (key) => !PREFERENCE_KEYS.includes(key as (typeof PREFERENCE_KEYS)[number]),
    ) ||
    (complete && PREFERENCE_KEYS.some((key) => !(key in patch)))
  )
    throw new AppError(ERRORS.SETTING_INVALID_VALUE)
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'logLevel' && !LOG_LEVELS.includes(value as never))
      throw new AppError(ERRORS.SETTING_INVALID_VALUE)
    if (key === 'displayLanguage' && !['system', 'zh', 'en', 'zh-Hant'].includes(value as string))
      throw new AppError(ERRORS.SETTING_INVALID_VALUE)
    if (
      (key === 'telemetryEnabled' ||
        key === 'analyticsEnabled' ||
        key === 'officialServicesEnabled' ||
        key === 'weeklyMutationCalibrationEnabled' ||
        key === 'workshopEnabled') &&
      typeof value !== 'boolean'
    )
      throw new AppError(ERRORS.SETTING_INVALID_VALUE)
    if (
      key === 'downloadDirectory' &&
      (typeof value !== 'string' || !value.trim() || value.includes('\0'))
    )
      throw new AppError(ERRORS.SETTING_INVALID_VALUE)
  }
  return patch
}
export function resolveDisplayLanguage(
  selection: DisplayLanguage,
  systemLanguages: string[],
): Exclude<DisplayLanguage, 'system'> {
  if (selection !== 'system') return selection
  for (const language of systemLanguages) {
    const value = language.toLowerCase()
    if (/^en(?:-|$)/.test(value)) return 'en'
    if (/^zh(?:-|$)/.test(value)) {
      if (value.includes('hant') || /-(tw|hk|mo)(?:-|$)/.test(value)) return 'zh-Hant'
      return 'zh'
    }
  }
  return 'zh'
}
