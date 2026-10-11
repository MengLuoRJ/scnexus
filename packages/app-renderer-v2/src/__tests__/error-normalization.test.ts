import { expect, test } from 'vitest'
import {
  AppError,
  ERRORS,
  isErrorDtoList,
  normalizeError,
  toErrorDto,
} from '@scnexus/app-shared/errors/app.error'

test.each([
  ['EACCES', ERRORS.FILESYSTEM_PERMISSION_DENIED],
  ['EPERM', ERRORS.FILESYSTEM_PERMISSION_DENIED],
  ['EBUSY', ERRORS.FILESYSTEM_BUSY],
  ['ETXTBSY', ERRORS.FILESYSTEM_BUSY],
  ['ENOSPC', ERRORS.FILESYSTEM_NO_SPACE],
  ['EDQUOT', ERRORS.FILESYSTEM_NO_SPACE],
  ['EIO', ERRORS.FILESYSTEM_OPERATION_FAILED],
  ['ENOENT', ERRORS.FILESYSTEM_OPERATION_FAILED],
] as const)(
  'classifies %s with an actionable description and original message',
  (code, definition) => {
    const original = Object.assign(new Error(`${code}: operation failed`), { code })
    const error = normalizeError(original)
    expect(toErrorDto(error)).toMatchObject({
      code: definition.code,
      description: definition.description,
      message: original.message,
      errorId: expect.any(String),
    })
    expect(error.cause).toBe(original)
  },
)

test.each([
  ['SevenZipError', ERRORS.ARCHIVE_EXTRACT_FAILED],
  ['SevenZipPathError', ERRORS.ARCHIVE_EXTRACT_FAILED],
  ['SevenZipTimeoutError', ERRORS.TASK_TIMEOUT],
] as const)('classifies %s without importing main-only dependencies', (name, definition) => {
  const original = Object.assign(new Error('7z operation detail'), { name })
  expect(toErrorDto(normalizeError(original))).toMatchObject({
    code: definition.code,
    message: original.message,
  })
})

test('keeps explicit business errors and does not expose arbitrary unexpected messages', () => {
  const error = new AppError(ERRORS.CONTENT_INSTALL_FAILED, {
    message: 'Install failed',
    taskId: 'task',
  })
  expect(normalizeError(error)).toBe(error)
  expect(toErrorDto(normalizeError(new Error('unexpected internal detail')))).toMatchObject({
    code: 'M001',
  })
  expect(
    toErrorDto(normalizeError(new Error('unexpected internal detail'))).message,
  ).toBeUndefined()
})

test('warning DTO lists require complete known error occurrences', () => {
  const warning = toErrorDto(new AppError(ERRORS.CONTENT_CLEANUP_WARNING))
  expect(isErrorDtoList([warning])).toBe(true)
  expect(isErrorDtoList([])).toBe(true)
  expect(isErrorDtoList([{ code: 'M062' }])).toBe(false)
  expect(isErrorDtoList('warning')).toBe(false)
})
