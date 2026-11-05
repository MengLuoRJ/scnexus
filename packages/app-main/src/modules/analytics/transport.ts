import axios from 'axios'
import { resolveServerApiBase } from '@scnexus/app-shared/config/server'

export type AnalyticsOperation =
  | 'register-anonymous'
  | 'register-authenticated'
  | 'heartbeat-anonymous'
  | 'heartbeat-authenticated'
  | 'leave'
export class AnalyticsRequestError extends Error {
  constructor(
    public readonly kind: 'network' | 'http' | 'aborted',
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super('Analytics request failed')
    this.name = 'AnalyticsRequestError'
  }
}
export interface AnalyticsTransport {
  request(
    operation: AnalyticsOperation,
    body: Record<string, string>,
    signal: AbortSignal,
    accessToken?: string,
  ): Promise<unknown>
}
const routes: Record<AnalyticsOperation, string> = {
  'register-anonymous': '/analytics/visitors',
  'register-authenticated': '/analytics/visitors/authenticated',
  'heartbeat-anonymous': '/analytics/presence/anonymous/heartbeat',
  'heartbeat-authenticated': '/analytics/presence/authenticated/heartbeat',
  leave: '/analytics/presence/leave',
}

export function createAnalyticsTransport(): AnalyticsTransport {
  const client = axios.create({
    baseURL: resolveServerApiBase(import.meta.env.DEV),
    adapter: 'http',
    timeout: 5000,
    maxRedirects: 0,
    proxy: false,
    withCredentials: false,
    maxContentLength: 16384,
    maxBodyLength: 16384,
    headers: { 'Content-Type': 'application/json', Cookie: undefined },
    validateStatus: (status) => status >= 200 && status < 300,
  })
  return {
    async request(operation, body, signal, accessToken) {
      try {
        const response = await client.post(routes[operation], body, {
          signal,
          timeout: 5000,
          headers: {
            Cookie: undefined,
            Authorization: accessToken ? `Bearer ${accessToken}` : undefined,
          },
        })
        return response.data
      } catch (error) {
        // Never retain Axios errors: they contain headers and visitor credentials.
        if (signal.aborted) throw new AnalyticsRequestError('aborted')
        if (axios.isAxiosError(error) && error.response) {
          const value: unknown = error.response.headers['retry-after']
          let retryAfterMs: number | undefined
          if (typeof value === 'string' || typeof value === 'number') {
            const seconds = Number(value)
            const delay = Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(String(value)) - Date.now()
            if (Number.isFinite(delay)) retryAfterMs = Math.max(0, delay)
          }
          throw new AnalyticsRequestError('http', error.response.status, retryAfterMs)
        }
        throw new AnalyticsRequestError('network')
      }
    },
  }
}
