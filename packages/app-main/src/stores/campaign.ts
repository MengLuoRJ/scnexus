import { normalizeInstalledPackage } from '../utils/installed-package'
import type { Schema } from 'electron-store'
import type { ContentStore, ContentRecord } from '@scnexus/app-shared/types/content.type'
import { isPackage } from '@scnexus/standard/package'
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
export function validateCampaignRecord(value: unknown): asserts value is ContentRecord {
  if (
    !isRecord(value) ||
    !isPackage(value.package) ||
    value.package.type !== 'campaign' ||
    !string(value.localId) ||
    !['scnexus', 'ccm'].includes(value.mode as string) ||
    !['package-json', 'ccm-converted', 'metadata-txt', 'auto-detected'].includes(
      value.origin as string,
    ) ||
    (value.origin === 'auto-detected' && value.mode !== 'scnexus')
  )
    invalidData('Invalid content record')
  for (const key of ['managementDirectory', 'descriptorPath', 'gameRoot', 'rootRelativePath'])
    if (!string(value[key])) invalidData('Missing content path')
  if (value.payloadDirectory !== null && !string(value.payloadDirectory))
    invalidData('Invalid payload path')
  if (
    !Array.isArray(value.files) ||
    !value.files.every(planned) ||
    !Array.isArray(value.installedFiles) ||
    !value.installedFiles.every(installed)
  )
    invalidData('Invalid installed resources')
  if (!isRecord(value.targetTree) || (value.sourceTree !== null && !isRecord(value.sourceTree)))
    invalidData('Invalid file trees')
  if (
    value.ccmOriginal !== null &&
    (!isRecord(value.ccmOriginal) ||
      !string(value.ccmOriginal.text) ||
      !string(value.ccmOriginal.encoding))
  )
    invalidData('Invalid CCM original')
  for (const key of ['fileCount', 'bytes', 'importedAt'])
    if (
      typeof value[key] !== 'number' ||
      !Number.isFinite(value[key]) ||
      (value[key] as number) < 0
    )
      invalidData('Invalid content statistics')
}
const recordSchema = {
  type: 'object',
  required: [
    'localId',
    'package',
    'mode',
    'files',
    'installedFiles',
    'gameRoot',
    'managementDirectory',
  ],
  properties: {
    localId: { type: 'string', minLength: 1 },
    package: {
      type: 'object',
      required: ['name', 'type'],
      properties: {
        name: { type: 'string' },
        type: { enum: ['campaign', 'customize'] },
      },
    },
    mode: { enum: ['scnexus', 'ccm'] },
    files: {
      type: 'array',
      items: {
        type: 'object',
        required: ['source', 'target', 'type', 'official', 'bytes'],
      },
    },
    installedFiles: {
      type: 'array',
      items: {
        type: 'object',
        required: ['absolutePath', 'result', 'hash', 'target'],
      },
    },
    gameRoot: { type: 'string' },
    managementDirectory: { type: 'string' },
  },
} as const
export function createCampaignRepository() {
  return createRepository<ContentStore>({
    defaults: () => ({
      _schemaVersion: 3,
      _revision: 0,
      records: [],
      legacyRecords: [],
      scannedAt: null,
    }),
    schema: {
      _schemaVersion: { const: 3 },
      _revision: { type: 'integer', minimum: 0 },
      records: { type: 'array', items: recordSchema },
      legacyRecords: { type: 'array', items: { type: 'object' } },
      scannedAt: { type: ['number', 'null'] },
    } as Schema<ContentStore>,
    validate(data) {
      if (!isRecord(data) || !Array.isArray(data.records)) invalidData('Invalid content store')
      const ids = new Set<string>()
      for (const record of data.records) {
        validateCampaignRecord(record)
        if (ids.has(record.localId)) invalidData('Duplicate local content ID')
        ids.add(record.localId)
      }
    },
    migrate(data, defaults) {
      if (isRecord(data) && data._schemaVersion === 2) {
        if (!Array.isArray(data.records)) invalidData('Invalid content records')
        return {
          ...data,
          _schemaVersion: defaults._schemaVersion,
          records: data.records.map((record) => {
            if (!isRecord(record)) invalidData('Invalid content record')
            return { ...record, package: normalizeInstalledPackage(record.package) }
          }),
        } as ContentStore
      }
      if (!isRecord(data)) invalidData('Invalid old content index')
      const old = data.CAMPAIGN_LIST_SET
      const values = Array.isArray(old)
        ? old
        : isRecord(old)
          ? Object.values(old).flat().filter(Boolean)
          : []
      return {
        ...defaults,
        legacyRecords: values as Record<string, unknown>[],
      }
    },
  })
}

export const campaignRepository = createCampaignRepository()
export const getCampaignStore = campaignRepository.getSnapshot
