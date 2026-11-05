import type { AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import { isVisitorCredential, type AnalyticsStorage, type VisitorCredential } from './storage'
import {
  AnalyticsRequestError,
  type AnalyticsOperation,
  type AnalyticsTransport,
} from './transport'

export interface AnalyticsDependencies {
  storage: AnalyticsStorage
  transport: AnalyticsTransport
  getClientId(): string
}
export function createAnalyticsService(deps: AnalyticsDependencies) {
  let disposed = false
  let started = false
  let enabled = true
  let online = true
  let generation = 0
  let loaded = false
  let credential: VisitorCredential | null = null
  let snapshot: AuthSnapshot | null = null
  let registered = false
  let allowAnonymous = true
  let paused: 'network' | 'auth' | 'permanent' | undefined
  let retryMs = 3000
  let repaired = false
  let queue = Promise.resolve()
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const ready = () =>
    started && enabled && online && !disposed && !paused && (snapshot !== null || allowAnonymous)
  function cancel() {
    generation++
    clearTimeout(timer)
    timer = undefined
    controller?.abort()
  }
  function schedule(delay: number) {
    clearTimeout(timer)
    if (ready())
      timer = setTimeout(() => {
        void enqueue()
      }, delay)
  }
  function enqueue(): Promise<void> {
    const current = generation
    const run = async () => {
      if (!ready() || current !== generation) return
      const abort = new AbortController()
      controller = abort
      const active = () => ready() && current === generation && !abort.signal.aborted
      const auth = snapshot
      async function request(operation: AnalyticsOperation, body: Record<string, string>) {
        let timeout: ReturnType<typeof setTimeout> | undefined
        let onAbort: (() => void) | undefined
        try {
          return await Promise.race([
            deps.transport
              .request(operation, body, abort.signal, auth?.accessToken ?? undefined)
              .then((result) => {
                if (
                  operation.startsWith('register') &&
                  current !== generation &&
                  !disposed &&
                  enabled &&
                  !credential &&
                  isVisitorCredential(result)
                ) {
                  const data = result as unknown as Record<string, unknown>
                  if (
                    data.clientType === 'DESKTOP' &&
                    data.heartbeatIntervalSeconds === 30 &&
                    data.onlineWindowSeconds === 90 &&
                    Date.parse(result.expiresAt) > Date.now()
                  ) {
                    const next = { visitorToken: result.visitorToken, expiresAt: result.expiresAt }
                    deps.storage.save(next)
                    credential = next
                  }
                }
                return result
              }),
            new Promise<never>((_, reject) => {
              onAbort = () => reject(new AnalyticsRequestError('aborted'))
              abort.signal.addEventListener('abort', onAbort, { once: true })
              timeout = setTimeout(() => {
                reject(new AnalyticsRequestError('network'))
                abort.abort()
              }, 5000)
            }),
          ])
        } finally {
          clearTimeout(timeout)
          if (onAbort) abort.signal.removeEventListener('abort', onAbort)
        }
      }
      try {
        if (!loaded) {
          credential = deps.storage.load()
          loaded = true
        }
        const clientId = deps.getClientId().toLowerCase()
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clientId)
        ) {
          paused = 'permanent'
          return
        }
        if (credential && Date.parse(credential.expiresAt) <= Date.now()) {
          credential = null
          registered = false
          deps.storage.clear()
        }
        if (!registered || !credential) {
          const body: Record<string, string> = { clientId }
          if (credential) body.visitorToken = credential.visitorToken
          if (!auth) body.clientType = 'DESKTOP'
          const result = await request(auth ? 'register-authenticated' : 'register-anonymous', body)
          if (disposed || !enabled || !isVisitorCredential(result)) return
          if (!isVisitorCredential(result)) throw new AnalyticsRequestError('http', 400)
          const data = result as unknown as Record<string, unknown>
          if (
            data.clientType !== 'DESKTOP' ||
            data.heartbeatIntervalSeconds !== 30 ||
            data.onlineWindowSeconds !== 90 ||
            Date.parse(result.expiresAt) <= Date.now() ||
            (credential && credential.visitorToken !== result.visitorToken)
          )
            throw new AnalyticsRequestError('http', 400)
          const next = { visitorToken: result.visitorToken, expiresAt: result.expiresAt }
          deps.storage.save(next)
          credential = next
          if (!active()) return
          registered = true
        }
        if (!active()) return
        const heartbeat = await request(auth ? 'heartbeat-authenticated' : 'heartbeat-anonymous', {
          visitorToken: credential.visitorToken,
          clientId,
        })
        if (!active()) return
        if (
          !heartbeat ||
          typeof heartbeat !== 'object' ||
          (heartbeat as Record<string, unknown>).accepted !== true ||
          (heartbeat as Record<string, unknown>).heartbeatIntervalSeconds !== 30 ||
          (heartbeat as Record<string, unknown>).onlineWindowSeconds !== 90
        )
          throw new AnalyticsRequestError('http', 400)
        retryMs = 3000
        schedule(30000)
      } catch (error) {
        if (current !== generation || disposed || !enabled || !online) return
        if (error instanceof AnalyticsRequestError) {
          if (error.kind === 'network') paused = 'network'
          else if (error.kind === 'http') {
            if (error.status === 401 && !auth && !repaired) {
              repaired = true
              credential = null
              registered = false
              try {
                deps.storage.clear()
                schedule(0)
              } catch {
                paused = 'permanent'
              }
            } else if (
              error.status === 429 ||
              (error.status !== undefined && error.status >= 500)
            ) {
              retryMs = Math.min(60000, retryMs * 2)
              schedule(
                Math.max(
                  Math.min(60000, retryMs + Math.random() * 1000),
                  Math.min(2147483647, error.retryAfterMs ?? 0),
                ),
              )
            } else paused = error.status === 401 && auth ? 'auth' : 'permanent'
          }
        } else paused = 'permanent'
      } finally {
        if (controller === abort) controller = undefined
      }
    }
    queue = queue.then(run, run)
    return queue
  }
  function authEvent(next: AuthSnapshot | null, anonymous: boolean) {
    cancel()
    snapshot = next?.status === 'signed-in' ? { ...next } : null
    allowAnonymous = anonymous
    registered = false
    repaired = false
    retryMs = 3000
    if (paused !== 'network') paused = undefined
    return enqueue()
  }
  return {
    startup(next: AuthSnapshot | null) {
      if (started || disposed) return queue
      started = true
      return authEvent(next, true)
    },
    login(next: AuthSnapshot) {
      if (disposed || next.status !== 'signed-in') return queue
      if (snapshot?.sessionId === next.sessionId && snapshot.epoch === next.epoch && registered) {
        snapshot = { ...next }
        return queue
      }
      return authEvent(next, false)
    },
    authenticationChanged(next: AuthSnapshot) {
      if (disposed) return queue
      if (
        next.status === 'refreshing' &&
        snapshot?.sessionId === next.sessionId &&
        snapshot.epoch === next.epoch
      ) {
        snapshot = { ...next, status: 'signed-in' }
        return queue
      }
      if (
        next.status === 'signed-in' &&
        snapshot?.sessionId === next.sessionId &&
        snapshot.epoch === next.epoch
      ) {
        snapshot = { ...next }
        if (paused === 'auth') {
          paused = undefined
          return enqueue()
        }
        return queue
      }
      // Explicit successful login/logout hooks start the next identity cycle.
      // Intermediate auth events only cancel the old identity and retain the latest token.
      cancel()
      snapshot = next.status === 'signed-in' ? { ...next } : null
      allowAnonymous = false
      registered = false
      return queue
    },
    async leave(auth: AuthSnapshot): Promise<void> {
      cancel()
      if (
        !started ||
        disposed ||
        !enabled ||
        !online ||
        paused === 'network' ||
        !credential ||
        !isVisitorCredential(credential) ||
        Date.parse(credential.expiresAt) <= Date.now() ||
        !auth.accessToken ||
        !['signed-in', 'refreshing'].includes(auth.status)
      )
        return
      const abort = new AbortController()
      controller = abort
      let timeout: ReturnType<typeof setTimeout> | undefined
      const aborted = new Promise<void>((resolve) => {
        abort.signal.addEventListener('abort', () => resolve(), { once: true })
        timeout = setTimeout(() => abort.abort(), 1000)
      })
      try {
        await Promise.race([
          deps.transport.request(
            'leave',
            { visitorToken: credential.visitorToken },
            abort.signal,
            auth.accessToken,
          ),
          aborted,
        ])
      } catch {
        // Optional presence reporting must never prevent session revocation.
      } finally {
        clearTimeout(timeout)
        if (controller === abort) controller = undefined
      }
    },
    logout() {
      if (disposed) return queue
      return authEvent(null, true)
    },
    setEnabled(value: boolean) {
      if (disposed || value === enabled) return queue
      enabled = value
      cancel()
      if (enabled) {
        if (paused !== 'network') paused = undefined
        repaired = false
      }
      return enqueue()
    },
    setOnline(value: boolean) {
      if (disposed) return queue
      if (value === online && !(value && paused === 'network')) return queue
      online = value
      cancel()
      if (online && paused === 'network') paused = undefined
      return enqueue()
    },
    dispose() {
      disposed = true
      cancel()
    },
  }
}
export type AnalyticsService = ReturnType<typeof createAnalyticsService>
