import { isDeepStrictEqual } from 'node:util'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

// Compatibility is limited to persisted/installed data, never author package input.
export function normalizeInstalledPackage(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
  const result = { ...value } as Record<string, unknown>
  if (result.bank_enable === 'offcial') result.bank_enable = 'official'
  if (Object.hasOwn(result, 'luancher')) {
    if (Object.hasOwn(result, 'launcher') && !isDeepStrictEqual(result.launcher, result.luancher))
      throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
        message: 'Conflicting installed launcher fields',
      })
    result.launcher = result.luancher
    delete result.luancher
  }
  return result
}
