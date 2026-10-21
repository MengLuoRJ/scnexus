import { isAbsolute, relative, resolve, sep } from 'node:path'

export const APPLICATION_ORIGIN = 'app://localhost'
export const APPLICATION_ENTRY = APPLICATION_ORIGIN + '/index.html'

export function isTrustedRendererUrl(value: string, developmentUrl?: string): boolean {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search) return false
    if (developmentUrl) {
      const allowed = new URL(developmentUrl)
      return url.origin === allowed.origin && url.pathname === allowed.pathname
    }
    return (
      url.protocol === 'app:' &&
      url.hostname === 'localhost' &&
      url.port === '' &&
      url.pathname === '/index.html'
    )
  } catch {
    return false
  }
}

export function applicationResourcePath(root: string, input: string): string {
  const url = new URL(input)
  if (
    url.protocol !== 'app:' ||
    url.hostname !== 'localhost' ||
    url.port ||
    url.username ||
    url.password
  )
    throw new Error('Untrusted application resource')
  const pathname = decodeURIComponent(url.pathname)
  if (pathname.includes('\\') || pathname.includes('\0'))
    throw new Error('Invalid application resource')
  const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
  const rel = relative(root, path)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep))
    throw new Error('Invalid application resource')
  return path
}
