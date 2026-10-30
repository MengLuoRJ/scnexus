import { app, protocol } from 'electron'
import { readFile, realpath } from 'node:fs/promises'
import { extname, join, relative, isAbsolute, sep } from 'node:path'
import { applicationResourcePath } from './origin'
import { resolveServerApiBase } from '@scnexus/app-shared/config/server'

function filesImageOrigin() {
  const value = process.env.SCNEXUS_FILES_ORIGIN
  if (!value) return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
      ? value
      : ''
  } catch {
    return ''
  }
}
function contentSecurityPolicy() {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${filesImageOrigin()}`,
    "font-src 'self' data:",
    `connect-src 'self' ${resolveServerApiBase(import.meta.env.DEV)}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
  ].join('; ')
}

export function registerApplicationScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
      },
    },
  ])
}
export function installApplicationProtocol() {
  const policy = contentSecurityPolicy()
  const root = join(app.getAppPath(), 'packages', 'app-renderer-v2', 'dist')
  protocol.handle('app', async (request) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD')
        return new Response(null, { status: 405 })
      const path = applicationResourcePath(root, request.url)
      const [actualRoot, actual] = await Promise.all([realpath(root), realpath(path)])
      const rel = relative(actualRoot, actual)
      if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep))
        return new Response(null, { status: 403 })
      const types: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff2': 'font/woff2',
      }
      return new Response(request.method === 'HEAD' ? null : await readFile(actual), {
        headers: {
          'Content-Type': types[extname(path)] ?? 'application/octet-stream',
          'Content-Security-Policy': policy,
          'Referrer-Policy': 'no-referrer',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
