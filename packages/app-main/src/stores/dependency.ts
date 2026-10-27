import type { ContentStore, DependencyContentRecord } from '@scnexus/app-shared/types/content.type'
import { isPackage } from '@scnexus/standard/package'
import { validateCustomizeRecord } from './customize'
import { createRepository, invalidData, isRecord } from './store-repository'

export function validateDependencyRecord(value: unknown): asserts value is DependencyContentRecord {
  if (!isRecord(value) || !isPackage(value.package) || value.package.type !== 'dependency')
    invalidData('Invalid dependency record')
  const common = { ...value, package: { ...value.package, type: 'customize' } }
  validateCustomizeRecord(common)
  if (
    value.payloadDirectory !== null ||
    value.ccmOriginal !== null ||
    value.origin !== 'package-json' ||
    ![...common.files, ...common.installedFiles].every(
      (file) => file.type === 'mod' && file.target.startsWith('Mods/') && !file.official,
    )
  )
    invalidData('Invalid dependency resources')
}

export function createDependencyRepository() {
  return createRepository<ContentStore>({
    defaults: () => ({
      _schemaVersion: 2,
      _revision: 0,
      records: [],
      legacyRecords: [],
      scannedAt: null,
    }),
    schema: {
      _schemaVersion: { const: 2 },
      _revision: { type: 'integer', minimum: 0 },
      records: { type: 'array', items: { type: 'object' } },
      legacyRecords: { type: 'array', items: { type: 'object' } },
      scannedAt: { type: ['number', 'null'] },
    },
    migrate() {
      return invalidData('Unsupported legacy dependency store')
    },
    validate(data) {
      if (!isRecord(data) || !Array.isArray(data.records)) invalidData('Invalid dependency store')
      const ids = new Set<string>()
      for (const record of data.records) {
        validateDependencyRecord(record)
        if (ids.has(record.localId)) invalidData('Duplicate local dependency ID')
        ids.add(record.localId)
      }
    },
  })
}

export const dependencyRepository = createDependencyRepository()
export const getDependencyStore = dependencyRepository.getSnapshot
