import { ERRORS, type ErrorDefinition } from './definitions.js'
export { ERRORS, type ErrorDefinition, type ErrorCode, type ErrorName } from './definitions.js'

export type ErrorOccurrence = { message?: string; taskId?: string }
export type AppErrorDto = ErrorDefinition & ErrorOccurrence & { errorId: string }
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: AppErrorDto }

export class AppError extends Error {
  readonly code: ErrorDefinition['code']
  readonly description?: string
  readonly errorId: string
  readonly taskId?: string

  constructor(
    definition: ErrorDefinition,
    occurrence: ErrorOccurrence = {},
    options?: ErrorOptions,
  ) {
    super(occurrence.message ?? '', options)
    this.name = definition.name
    this.code = definition.code
    this.description = definition.description
    this.errorId = globalThis.crypto.randomUUID()
    this.taskId = occurrence.taskId
  }
}

export function normalizeError(
  error: unknown,
  definition: ErrorDefinition = ERRORS.APP_UNEXPECTED_ERROR,
): AppError {
  if (error instanceof AppError) return error
  const legacy: Record<string, ErrorDefinition> = {
    INVALID_COMPRESSED_FILE: ERRORS.ARCHIVE_INVALID,
    ADMZIP_INITIALIZE_ERROR: ERRORS.ARCHIVE_INVALID,
    METADATA_NOT_FOUND: ERRORS.ARCHIVE_METADATA_MISSING,
    METADATA_INFORMATED_INCOMPLETE: ERRORS.ARCHIVE_METADATA_INVALID,
    METHOD_SCNEXUS_ONLY: ERRORS.CONTENT_TYPE_UNSUPPORTED,
    METHOD_CCM_ONLY: ERRORS.CONTENT_TYPE_UNSUPPORTED,
    METHOD_TYPE_UNSUPPORTED: ERRORS.CONTENT_TYPE_UNSUPPORTED,
    UNCOMPRESSING_ERROR: ERRORS.ARCHIVE_EXTRACT_FAILED,
    FILES_COPY_ERROR: ERRORS.CONTENT_INSTALL_FAILED,
    FILES_REMOVE_ERROR: ERRORS.CONTENT_UNINSTALL_FAILED,
  }
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const legacyDefinition = Object.hasOwn(legacy, message) ? legacy[message] : undefined
  if (legacyDefinition) return new AppError(legacyDefinition, { message }, { cause: error })
  return new AppError(definition, {}, { cause: error })
}

export function toErrorDto(error: AppError): AppErrorDto {
  const definition = Object.values(ERRORS).find((item) => item.code === error.code)!
  return {
    ...definition,
    errorId: error.errorId,
    ...(error.message ? { message: error.message } : {}),
    ...(error.taskId ? { taskId: error.taskId } : {}),
  }
}

export function isErrorDto(value: unknown): value is AppErrorDto {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  const definition = Object.values(ERRORS).find((item) => item.code === data.code)
  return (
    !!definition &&
    data.name === definition.name &&
    data.description === definition.description &&
    typeof data.errorId === 'string' &&
    data.errorId.length > 0 &&
    (data.message === undefined || typeof data.message === 'string') &&
    (data.taskId === undefined || typeof data.taskId === 'string')
  )
}
