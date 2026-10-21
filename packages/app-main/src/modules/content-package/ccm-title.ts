import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

export function ccmDirectoryName(title: string): string {
  const name = title
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, '')
    .trim()
    .replace(/\s/g, '_')
    .replace(/\.+$/, '')
  if (
    !name ||
    /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) ||
    Buffer.byteLength(name, 'utf8') > 255 ||
    name.length > 255
  ) {
    throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID, {
      message: 'CCM title cannot form a portable directory name',
    })
  }
  return name
}
