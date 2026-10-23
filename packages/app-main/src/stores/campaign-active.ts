import type { Schema } from 'electron-store'
import type {
  ActiveCampaign,
  CampaignActiveStoreData,
} from '@scnexus/app-shared/types/content.type'
import { createRepository, invalidData, isRecord } from './store-repository'
const string = (value: unknown) => typeof value === 'string' && !value.includes('\0')
function planned(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    string(value.source) &&
    string(value.target) &&
    ['map', 'mod'].includes(value.type as string) &&
    typeof value.official === 'boolean' &&
    typeof value.bytes === 'number' &&
    Number.isFinite(value.bytes) &&
    value.bytes >= 0 &&
    (value.modifiedAt === null ||
      (typeof value.modifiedAt === 'number' && Number.isFinite(value.modifiedAt)))
  )
}
function installed(value: unknown): boolean {
  return (
    planned(value) &&
    isRecord(value) &&
    string(value.absolutePath) &&
    string(value.hash) &&
    ['copied', 'replaced', 'kept'].includes(value.result as string)
  )
}
export function validateActive(value: unknown): asserts value is ActiveCampaign {
  if (
    !isRecord(value) ||
    !string(value.localId) ||
    !['WOL', 'HOTS', 'LOTV', 'NCO'].includes(value.campaign as string) ||
    !['ccm', 'scnexus'].includes(value.mode as string) ||
    !string(value.descriptorPath) ||
    !string(value.gameRoot) ||
    !Array.isArray(value.installedFiles) ||
    !value.installedFiles.every(installed) ||
    typeof value.activatedAt !== 'number'
  )
    invalidData('Invalid active campaign')
  if (value.ownershipUnknown !== undefined && typeof value.ownershipUnknown !== 'boolean')
    invalidData('Invalid ownership state')
  if (value.resourceBackups !== undefined) {
    if (!Array.isArray(value.resourceBackups)) invalidData('Invalid resource backups')
    for (const backup of value.resourceBackups) {
      if (!isRecord(backup) || !string(backup.target) || !string(backup.path))
        invalidData('Invalid resource backup')
    }
  }
}
export function createActiveRepository() {
  return createRepository<CampaignActiveStoreData>({
    defaults: () => ({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    schema: {
      _schemaVersion: { const: 2 },
      _revision: { type: 'integer', minimum: 0 },
      active: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(
          ['WOL', 'HOTS', 'LOTV', 'NCO'].map((c) => [
            c,
            {
              type: 'object',
              required: [
                'localId',
                'campaign',
                'mode',
                'descriptorPath',
                'installedFiles',
                'activatedAt',
                'gameRoot',
              ],
            },
          ]),
        ),
      },
      legacyRecords: { type: 'array', items: { type: 'object' } },
      scannedAt: { type: ['number', 'null'] },
    } as Schema<CampaignActiveStoreData>,
    validate(data) {
      if (!isRecord(data) || !isRecord(data.active)) invalidData('Invalid active store')
      for (const [campaign, value] of Object.entries(data.active)) {
        validateActive(value)
        if (value.campaign !== campaign) invalidData('Active campaign slot mismatch')
      }
    },
    migrate(data, defaults) {
      if (!isRecord(data)) invalidData('Invalid old active index')
      return {
        ...defaults,
        legacyRecords: isRecord(data.CAMPAIGN_SET)
          ? (Object.values(data.CAMPAIGN_SET).filter(Boolean) as Record<string, unknown>[])
          : [],
      }
    },
  })
}

export const campaignActiveRepository = createActiveRepository()
export const getCampaignActiveStore = campaignActiveRepository.getSnapshot
