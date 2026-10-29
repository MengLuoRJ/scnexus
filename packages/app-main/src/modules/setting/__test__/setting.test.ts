import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  AppError,
  ERRORS,
  normalizeError,
  toErrorDto,
  isErrorDto,
} from '@scnexus/app-shared/errors/app.error'
import { validatePreferencePatch, resolveDisplayLanguage } from '../setting-validation'

test('errors preserve definition and occurrence across normalization', () => {
  const first = new AppError(ERRORS.APP_INITIALIZATION_FAILED, {
    taskId: 'startup',
  })
  const second = new AppError(ERRORS.APP_INITIALIZATION_FAILED)
  assert.equal(first.code, 'M002')
  assert.equal(normalizeError(first), first)
  assert.notEqual(first.errorId, second.errorId)
  const dto = toErrorDto(first)
  assert.equal(dto.name, 'APP-INITIALIZATION-FAILED')
  assert.equal(dto.taskId, 'startup')
  assert.equal('message' in dto, false)
  assert.ok(isErrorDto(dto))
  assert.equal(isErrorDto({ ...dto, code: 'P001' }), false)
})
test('settings accept only editable flat fields and valid values', () => {
  assert.deepEqual(validatePreferencePatch({ logLevel: 'error', telemetryEnabled: false }), {
    logLevel: 'error',
    telemetryEnabled: false,
  })
  for (const value of [
    { clientId: 'replace' },
    { _revision: 1 },
    { logLevel: 'off' },
    { telemetryEnabled: 'true' },
    { workshopEnabled: 'true' },
    { officialServicesEnabled: 'true' },
    { weeklyMutationCalibrationEnabled: 1 },
    { displayLanguage: 'de' },
    [],
  ]) {
    assert.throws(() => validatePreferencePatch(value), AppError)
  }
  assert.throws(() => validatePreferencePatch({ logLevel: 'error' }, true), AppError)
})
test('system display language uses supported preference then Chinese fallback', () => {
  assert.equal(resolveDisplayLanguage('system', ['de-DE', 'en-GB']), 'en')
  assert.equal(resolveDisplayLanguage('system', ['zh-Hant-HK']), 'zh-Hant')
  assert.equal(resolveDisplayLanguage('system', ['de-DE']), 'zh')
  assert.equal(resolveDisplayLanguage('en', ['zh']), 'en')
})
