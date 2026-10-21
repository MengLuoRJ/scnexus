import axios from 'axios'
import { failure } from './validation'

export type AuthOperation =
  | 'login'
  | 'register'
  | 'mfa'
  | 'challenge'
  | 'reset'
  | 'refresh'
  | 'logout'
export interface AuthTransport {
  request(
    operation: AuthOperation,
    body: Record<string, unknown>,
    signal: AbortSignal,
    accessToken?: string,
  ): Promise<unknown>
}
const routes: Record<AuthOperation, string> = {
  login: '/auth/login',
  register: '/auth/register',
  mfa: '/auth/two-factor/login',
  challenge: '/auth/challenges',
  reset: '/auth/password/reset',
  refresh: '/auth/refresh',
  logout: '/sessions/current',
}
export function createAuthTransport(): AuthTransport {
  // The Node adapter bypasses Chromium's cookie jar; redirects and proxy environment are disabled.
  const client = axios.create({
    baseURL: import.meta.env.DEV ? 'http://127.0.0.1:3000' : 'https://api.scnexus.net',
    adapter: 'http',
    timeout: 10000,
    maxRedirects: 0,
    proxy: false,
    withCredentials: false,
    maxContentLength: 65536,
    maxBodyLength: 16384,
    headers: { 'Content-Type': 'application/json', Cookie: undefined },
    validateStatus: (status) => status >= 200 && status < 300,
  })
  return {
    async request(operation, body, signal, accessToken) {
      try {
        const result = await client.request({
          method: operation === 'logout' ? 'DELETE' : 'POST',
          url: routes[operation],
          data: operation === 'logout' ? undefined : body,
          signal,
          timeout: operation === 'logout' ? 2000 : 10000,
          headers: {
            Cookie: undefined,
            Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          },
        })
        return result.data
      } catch {
        throw failure()
      }
    },
  }
}
