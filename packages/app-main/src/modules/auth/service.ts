import type { AuthChallenge, AuthSnapshot } from '@scnexus/app-shared/types/auth.type'
import { isStrongPassword } from '@scnexus/app-shared/utils/auth-password'
import type { AuthStorage } from './storage'
import type { AuthOperation, AuthTransport } from './transport'
import {
  failure,
  invalid,
  loginInput,
  object,
  otp,
  email,
  uuid,
  clientUuid,
  tokenPair,
  authFailure,
} from './validation'

export interface AuthDependencies {
  storage: AuthStorage
  transport: AuthTransport
  changed(snapshot: AuthSnapshot): void
  now?: () => number
  getClientId?: () => string
}
const empty = (): AuthSnapshot => ({
  status: 'signed-out',
  epoch: 0,
  version: 0,
  accessToken: null,
  accessExpiresAt: null,
  sessionId: null,
  clientId: null,
  sessionExpiresAt: null,
  mfaExpiresAt: null,
})

export function createAuthService(deps: AuthDependencies) {
  const now = deps.now ?? Date.now
  let snapshot = empty()
  let secret: string | null = null
  let mfa: string | null = null
  let disposed = false
  let loggingOut = false
  let startup: Promise<void> | undefined
  let flight: Promise<AuthSnapshot> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const controllers = new Set<AbortController>()
  function active() {
    if (disposed || loggingOut) throw failure()
  }
  function current(epoch: number) {
    if (disposed || snapshot.epoch !== epoch) throw failure()
  }
  function emit(patch: Partial<AuthSnapshot>) {
    snapshot = { ...snapshot, ...patch, version: snapshot.version + 1 }
    try {
      deps.changed({ ...snapshot })
    } catch {
      /* A closed window cannot invalidate a committed session. */
    }
  }
  function stop() {
    if (timer) clearTimeout(timer)
    timer = undefined
    for (const controller of controllers) controller.abort()
    controllers.clear()
    flight = undefined
  }
  function reset(publish = true) {
    stop()
    secret = null
    mfa = null
    const next = { ...empty(), epoch: snapshot.epoch + 1 }
    if (publish) emit(next)
    else snapshot = { ...next, version: snapshot.version + 1 }
  }
  function clearDisk() {
    try {
      deps.storage.clear()
    } catch {
      throw failure('storage')
    }
  }
  function invalidate() {
    reset()
    clearDisk()
  }
  async function request(operation: AuthOperation, body: Record<string, unknown>, epoch: number) {
    current(epoch)
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const result = await deps.transport.request(operation, body, controller.signal)
      current(epoch)
      return result
    } catch (error) {
      throw authFailure(error)
    } finally {
      controllers.delete(controller)
    }
  }
  async function revoke(accessToken: string): Promise<boolean> {
    const controller = new AbortController()
    controllers.add(controller)
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        deps.transport.request('logout', {}, controller.signal, accessToken).then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => {
            controller.abort()
            resolve(false)
          }, 2000)
        }),
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
      controller.abort()
      controllers.delete(controller)
    }
  }
  function commit(value: unknown, epoch: number) {
    current(epoch)
    let pair
    try {
      pair = tokenPair(value, now())
    } catch {
      throw failure('response')
    }
    try {
      deps.storage.save(pair.refreshToken)
    } catch {
      invalidate()
      void revoke(pair.accessToken)
      throw failure('storage')
    }
    current(epoch)
    secret = pair.refreshToken
    mfa = null
    const expiresAt = Math.min(now() + pair.expiresIn * 1000, Date.parse(pair.sessionExpiresAt))
    emit({
      status: 'signed-in',
      accessToken: pair.accessToken,
      accessExpiresAt: expiresAt,
      sessionId: pair.sessionId,
      clientId: pair.clientId ?? null,
      sessionExpiresAt: pair.sessionExpiresAt,
      mfaExpiresAt: null,
    })
    timer = setTimeout(
      () => {
        void refresh().catch(() => {})
      },
      Math.max(1, expiresAt - now() + 1),
    )
    timer.unref?.()
    return { ...snapshot }
  }
  async function authenticate(value: unknown, register: boolean) {
    active()
    const input = loginInput(value, register)
    invalidate()
    const epoch = snapshot.epoch
    emit({ status: 'authenticating' })
    try {
      const clientId = deps.getClientId?.()
      if (deps.getClientId && !clientUuid(clientId)) throw failure()
      const result = await request(
        register ? 'register' : 'login',
        {
          ...input,
          provider: 'EMAIL',
          clientType: 'DESKTOP',
          ...(clientId === undefined ? {} : { clientId: clientId.toLowerCase() }),
        },
        epoch,
      )
      if (!register && result && typeof result === 'object' && 'mfaRequired' in result) {
        const ticket = object(result, ['mfaRequired', 'challengeId', 'expiresIn'], [], false)
        if (ticket.mfaRequired !== true || !uuid(ticket.challengeId) || ticket.expiresIn !== 300)
          throw failure()
        mfa = ticket.challengeId
        emit({ status: 'mfa-pending', mfaExpiresAt: now() + 300000 })
        timer = setTimeout(() => {
          if (!disposed && snapshot.epoch === epoch) {
            try {
              invalidate()
            } catch {
              /* Already signed out. */
            }
          }
        }, 300000)
        timer.unref?.()
        return { ...snapshot }
      }
      return commit(result, epoch)
    } catch (error) {
      if (!disposed && snapshot.epoch === epoch) invalidate()
      throw authFailure(error)
    }
  }
  function rotate(epoch: number): Promise<AuthSnapshot> {
    const token = secret
    if (!token) return Promise.reject(failure())
    // Remove the consumed credential before dispatch: a crash must never replay it at startup.
    try {
      clearDisk()
    } catch {
      reset()
      return Promise.reject(failure())
    }
    secret = null
    if (timer) clearTimeout(timer)
    timer = undefined
    emit({ status: 'refreshing' })
    const pending = (async () => {
      try {
        const value = await request(
          'refresh',
          { refreshToken: token, clientType: 'DESKTOP' },
          epoch,
        )
        const pair = tokenPair(value, now())
        if (
          snapshot.sessionId &&
          (pair.sessionId !== snapshot.sessionId ||
            pair.sessionExpiresAt !== snapshot.sessionExpiresAt)
        )
          throw failure()
        return commit(pair, epoch)
      } catch (error) {
        if (!disposed && snapshot.epoch === epoch) invalidate()
        throw authFailure(error)
      }
    })()
    flight = pending
    void pending
      .finally(() => {
        if (flight === pending) flight = undefined
      })
      .catch(() => {})
    return pending
  }
  function refresh(): Promise<AuthSnapshot> {
    try {
      active()
      if (flight) return flight
      if (
        snapshot.accessToken &&
        snapshot.accessExpiresAt! > now() &&
        snapshot.sessionExpiresAt &&
        Date.parse(snapshot.sessionExpiresAt) > now()
      )
        return Promise.resolve({ ...snapshot })
      if (snapshot.sessionExpiresAt && Date.parse(snapshot.sessionExpiresAt) <= now()) {
        invalidate()
        throw failure()
      }
      return rotate(snapshot.epoch)
    } catch {
      return Promise.reject(failure())
    }
  }
  return {
    getSnapshot() {
      active()
      return { ...snapshot }
    },
    login(value: unknown) {
      return authenticate(value, false)
    },
    register(value: unknown) {
      return authenticate(value, true)
    },
    async completeMfa(value: unknown) {
      active()
      const factor = object(value, [], ['code', 'recoveryCode'])
      if (
        Object.hasOwn(factor, 'code') === Object.hasOwn(factor, 'recoveryCode') ||
        ('code' in factor
          ? !otp(factor.code)
          : !(
              typeof factor.recoveryCode === 'string' && /^[a-f0-9]{32}$/i.test(factor.recoveryCode)
            ))
      )
        invalid()
      if (!mfa || snapshot.status !== 'mfa-pending' || snapshot.mfaExpiresAt! <= now())
        throw failure()
      const epoch = snapshot.epoch
      const challengeId = mfa
      mfa = null
      if (timer) clearTimeout(timer)
      timer = undefined
      emit({ status: 'authenticating', mfaExpiresAt: null })
      try {
        return commit(
          await request('mfa', { ...factor, challengeId, clientType: 'DESKTOP' }, epoch),
          epoch,
        )
      } catch (error) {
        if (!disposed && snapshot.epoch === epoch) invalidate()
        throw authFailure(error)
      }
    },
    async requestChallenge(value: unknown): Promise<AuthChallenge> {
      active()
      const input = object(value, ['subject', 'purpose'])
      if (!email(input.subject) || (input.purpose !== 'REGISTER' && input.purpose !== 'RESET'))
        invalid()
      const result = object(
        await request('challenge', { ...input, provider: 'EMAIL' }, snapshot.epoch),
        ['accepted', 'challengeId', 'expiresIn', 'retryAfter'],
        [],
        false,
      )
      if (
        result.accepted !== true ||
        !uuid(result.challengeId) ||
        result.expiresIn !== 600 ||
        result.retryAfter !== 60
      )
        throw failure()
      return result as AuthChallenge
    },
    async resetPassword(value: unknown): Promise<{ success: true }> {
      active()
      const input = object(value, ['challengeId', 'proof', 'password'])
      if (
        !uuid(input.challengeId) ||
        !otp(input.proof) ||
        typeof input.password !== 'string' ||
        !isStrongPassword(input.password)
      )
        invalid()
      const epoch = snapshot.epoch
      const result = object(await request('reset', input, epoch), ['success'], [], false)
      if (result.success !== true) throw failure()
      current(epoch)
      invalidate()
      return { success: true }
    },
    refresh,
    async logout(): Promise<{ remoteRevoked: boolean }> {
      active()
      const token = snapshot.accessToken
      loggingOut = true
      try {
        invalidate()
        return { remoteRevoked: token ? await revoke(token) : false }
      } finally {
        loggingOut = false
      }
    },
    start(): Promise<void> {
      if (startup) return startup
      if (disposed) return Promise.resolve()
      const epoch = snapshot.epoch
      startup = (async () => {
        try {
          secret = deps.storage.load()
          if (secret) await rotate(epoch)
        } catch {
          if (!disposed && snapshot.epoch === epoch) {
            try {
              invalidate()
            } catch {
              /* Storage failure must not prevent local app startup. */
            }
          }
        }
      })()
      return startup
    },
    dispose() {
      if (disposed) return
      disposed = true
      reset(false)
    },
  }
}
export type AuthService = ReturnType<typeof createAuthService>
