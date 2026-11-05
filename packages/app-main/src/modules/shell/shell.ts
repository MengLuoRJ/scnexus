import { shell } from 'electron'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'

export async function openExternalWebsite(link: string): Promise<void> {
  let url: URL
  try {
    if (typeof link !== 'string') throw new TypeError('Expected a URL string')
    url = new URL(link)
  } catch (cause) {
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: 'Invalid website URL' }, { cause })
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
      message: 'Only HTTP(S) website URLs without credentials are allowed',
    })
  }
  await shell.openExternal(url.href)
}

export async function openExternalDownload(link: string): Promise<void> {
  let url: URL
  try {
    if (
      typeof link !== 'string' ||
      link.length > 2048 ||
      // oxlint-disable-next-line no-control-regex -- Download URLs must reject raw control characters.
      /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(link) ||
      !/^https:\/\/[^/?#@]+(?:[/?#]|$)/i.test(link)
    )
      throw new TypeError('Expected a complete HTTPS URL')
    url = new URL(link)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password)
      throw new TypeError('Expected an HTTPS URL without credentials')
  } catch (cause) {
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: 'Invalid download URL' }, { cause })
  }
  await shell.openExternal(url.href)
}

export function openPath(path: string) {
  if (path) return shell.openPath(path)
}

export function showItemInFolder(path: string) {
  if (path) return shell.showItemInFolder(path)
}
