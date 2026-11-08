export const DEVELOPMENT_SERVER_API = 'http://127.0.0.1:3000'
export const PRODUCTION_SERVER_API = 'https://api.scnexus.net'

export function resolveServerApiBase(
  development: boolean,
  configured: string | undefined = import.meta.env.VITE_SCNEXUS_API_ORIGIN,
): string {
  if (configured === undefined) return development ? DEVELOPMENT_SERVER_API : PRODUCTION_SERVER_API
  try {
    const url = new URL(configured)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      url.origin === configured &&
      !url.username &&
      !url.password &&
      (url.protocol === 'https:' || (development && local && url.protocol === 'http:'))
    )
      return configured
  } catch {}
  throw new Error(
    'Invalid VITE_SCNEXUS_API_ORIGIN: expected an HTTPS origin (local HTTP is allowed in development)',
  )
}
