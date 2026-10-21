export const DEVELOPMENT_SERVER_API = 'http://127.0.0.1:3000'
export const PRODUCTION_SERVER_API = 'https://api.scnexus.net'

export function resolveServerApiBase(development: boolean): string {
  return development ? DEVELOPMENT_SERVER_API : PRODUCTION_SERVER_API
}
