import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

export function isContentDiagnostic(error: unknown): error is AppError {
  return (
    error instanceof AppError &&
    [
      ERRORS.ARCHIVE_METADATA_INVALID.code,
      ERRORS.ARCHIVE_METADATA_MISSING.code,
      ERRORS.CONTENT_TYPE_UNSUPPORTED.code,
      ERRORS.FILESYSTEM_PATH_REJECTED.code,
      ERRORS.STORE_DATA_INVALID.code,
    ].some((code) => code === error.code)
  )
}
