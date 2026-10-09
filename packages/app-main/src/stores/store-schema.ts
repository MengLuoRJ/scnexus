import type { Schema } from 'electron-store'
import type { StoreVersion } from './store-repository'

export const versionSchema = {
  _schemaVersion: { type: 'integer', const: 1 },
  _revision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
} satisfies Schema<StoreVersion>

export const stringSchema = {
  type: 'string',
  pattern: '^[^\\u0000]*$',
} as const
export const timeSchema = { type: 'number', minimum: 0 } as const
