import axios, { type AxiosRequestConfig } from 'axios'
import { resolveServerApiBase } from '@scnexus/app-shared/config/server'
import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'

export type ApiErrorKind =
  | 'notFound'
  | 'conflict'
  | 'badRequest'
  | 'unauthorized'
  | 'forbidden'
  | 'rateLimited'
  | 'unavailable'
  | 'network'
  | 'invalidResponse'
  | 'stale'
  | 'desktop'
  | 'credentialStorage'
  | 'registrationRejected'
export class AccountError extends Error {
  constructor(readonly kind: ApiErrorKind) {
    super(kind)
    this.name = 'AccountError'
  }
}
export function accountErrorKey(error: unknown): string {
  return `account.error.${error instanceof AccountError ? error.kind : 'desktop'}`
}
export type ApiAuth = {
  getSnapshot(): AuthSnapshot
  refresh(): Promise<void>
  invalidate?(): Promise<void>
}
const http = axios.create({
  baseURL: resolveServerApiBase(import.meta.env.DEV),
  adapter: 'fetch',
  fetchOptions: { redirect: 'error', credentials: 'omit', cache: 'no-store' },
  withCredentials: false,
  timeout: 15000,
})
function failure(error: unknown): AccountError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const kinds: Record<number, ApiErrorKind> = {
    400: 'badRequest',
    401: 'unauthorized',
    403: 'forbidden',
    404: 'notFound',
    409: 'conflict',
    429: 'rateLimited',
    503: 'unavailable',
  }
  return new AccountError(status ? (kinds[status] ?? 'unavailable') : 'network')
}
export async function apiRequest<T>(
  path: string,
  validate: (value: unknown) => T,
  auth?: ApiAuth,
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
  params?: Record<string, string>,
  options?: { preserveSessionOnUnauthorized?: boolean },
): Promise<T> {
  // Only application-relative paths may receive a Bearer token; reject URL parser normalization tricks.
  if (!/^\/[A-Za-z0-9_/-]+$/.test(path) || path.includes('//') || path.includes('..'))
    throw new AccountError('badRequest')
  const initial = auth
    ? { epoch: auth.getSnapshot().epoch, sessionId: auth.getSnapshot().sessionId }
    : undefined
  const current = () => {
    const value = auth?.getSnapshot()
    if (initial && (value?.epoch !== initial.epoch || value.sessionId !== initial.sessionId))
      throw new AccountError('stale')
    return value
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const snapshot = current()
    if (auth && (!snapshot?.accessToken || !['signed-in', 'refreshing'].includes(snapshot.status)))
      throw new AccountError('unauthorized')
    const config: AxiosRequestConfig = {
      url: path,
      method,
      data: body,
      ...(params ? { params } : {}),
      withCredentials: false,
      headers: snapshot?.accessToken ? { Authorization: `Bearer ${snapshot.accessToken}` } : {},
    }
    let data: unknown
    try {
      data = (await http.request<unknown>(config)).data
    } catch (error) {
      current()
      const clean = failure(error)
      if (
        clean.kind === 'unauthorized' &&
        auth &&
        attempt === 0 &&
        (method === 'GET' || method === 'HEAD')
      ) {
        await auth.refresh()
        current()
        continue
      }
      if (clean.kind === 'unauthorized' && auth && !options?.preserveSessionOnUnauthorized)
        await auth.invalidate?.()
      throw clean
    }
    current()
    try {
      return validate(data)
    } catch {
      throw new AccountError('invalidResponse')
    }
  }
  throw new AccountError('unauthorized')
}
