import axios from 'axios'
import { app } from 'electron'
import { resolveServerApiBase } from '@scnexus/app-shared/config/server'
import {
  mutationLanguages,
  mutationRegions,
  validateMutatorCatalog,
  validateWeeklyMutation,
} from '@scnexus/app-shared/mutations/contracts'
import type { MutationLanguage, MutationRegion } from '@scnexus/app-shared/mutations/contracts'
import { localMutatorCatalog, localWeeklyMutation } from '@scnexus/app-shared/mutations/local-data'
import { settingRepository } from '../../stores/setting'

const CALIBRATION_TIMEOUT_MS = 5000
function checkCancellation(signal: AbortSignal) {
  if (signal.aborted) throw new Error('REQUEST_CANCELLED')
}
function calibrationEnabled() {
  const settings = settingRepository.getSnapshot()
  return settings.officialServicesEnabled && settings.weeklyMutationCalibrationEnabled
}
function languageSelection(language: MutationLanguage = 'zhCN') {
  if (!mutationLanguages.includes(language)) throw new Error('INVALID_ARGUMENT')
  return language
}
async function calibrate<T>(
  path: string,
  params: Record<string, string>,
  validate: (value: unknown) => T,
  fallback: T,
  signal: AbortSignal,
): Promise<T> {
  checkCancellation(signal)
  if (!calibrationEnabled()) return fallback
  try {
    const response = await axios.get<unknown>(`${resolveServerApiBase(!app.isPackaged)}${path}`, {
      params,
      timeout: CALIBRATION_TIMEOUT_MS,
      signal: AbortSignal.any([signal, AbortSignal.timeout(CALIBRATION_TIMEOUT_MS)]),
      adapter: 'http',
      proxy: false,
      maxRedirects: 0,
      maxContentLength: 1024 * 1024,
      withCredentials: false,
    })
    checkCancellation(signal)
    return calibrationEnabled() ? validate(response.data) : fallback
  } catch {
    checkCancellation(signal)
    return fallback
  }
}
export async function readMutators(
  args: { language?: MutationLanguage; search?: string; offset?: number; limit?: number },
  signal: AbortSignal,
) {
  checkCancellation(signal)
  const language = languageSelection(args.language)
  const offset = args.offset ?? 0
  const limit = args.limit ?? 20
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 100000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    (args.search !== undefined && (typeof args.search !== 'string' || args.search.length > 100))
  )
    throw new Error('INVALID_ARGUMENT')
  const local = validateMutatorCatalog(localMutatorCatalog(language), language)
  const catalog = await calibrate(
    '/sc2/coop/mutators',
    { language },
    (value) => {
      const result = validateMutatorCatalog(value, language)
      return result.items.length ? result : local
    },
    local,
    signal,
  )
  checkCancellation(signal)
  const search = args.search?.trim().toLocaleLowerCase()
  const items = catalog.items.filter(
    (item) =>
      !search ||
      [item.id, item.displayName, item.description, ...Object.values(item.name)].some((value) =>
        value?.toLocaleLowerCase().includes(search),
      ),
  )
  return {
    revision: catalog.revision,
    language,
    total: items.length,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
  }
}
export async function readWeeklyMutation(
  args: { region?: MutationRegion; language?: MutationLanguage },
  signal: AbortSignal,
) {
  checkCancellation(signal)
  const language = languageSelection(args.language)
  const region = args.region ?? 'CN'
  if (!mutationRegions.includes(region)) throw new Error('INVALID_ARGUMENT')
  const local = validateWeeklyMutation(
    localWeeklyMutation(Date.now(), undefined, region, language),
    region,
    language,
  )
  const result = await calibrate(
    '/sc2/coop/weekly-mutations/current',
    { region, language },
    (value) => validateWeeklyMutation(value, region, language),
    local,
    signal,
  )
  checkCancellation(signal)
  return result.available &&
    Date.parse(result.startsAt) <= Date.now() &&
    Date.now() < Date.parse(result.endsAt)
    ? result
    : local
}
