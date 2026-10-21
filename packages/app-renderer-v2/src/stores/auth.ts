import { computed, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { IpcResult } from '@scnexus/app-shared/errors/app.error'
import type {
  AuthSnapshot,
  AuthLoginInput,
  AuthRegisterInput,
  AuthFactorInput,
  AuthChallengeInput,
  AuthResetInput,
} from '@scnexus/app-shared/types/auth.type'
import {
  ipcAuthGetSnapshot,
  ipcAuthLogin,
  ipcAuthRegister,
  ipcAuthCompleteMfa,
  ipcAuthRequestChallenge,
  ipcAuthResetPassword,
  ipcAuthRefresh,
  ipcAuthLogout,
  ipcAuthOnChanged,
} from '../ipcs/auth'
import { apiUserMe, apiUserAuthorization, AccountError } from '../apis'
import type { AccountUser, AccountAuthorization } from '../apis'

const signedOut = (): AuthSnapshot => ({
  status: 'signed-out',
  epoch: 0,
  version: -1,
  accessToken: null,
  accessExpiresAt: null,
  sessionId: null,
  sessionExpiresAt: null,
  mfaExpiresAt: null,
})
function validSnapshot(value: AuthSnapshot): boolean {
  if (
    !value ||
    !['signed-out', 'authenticating', 'mfa-pending', 'signed-in', 'refreshing'].includes(
      value.status,
    ) ||
    !Number.isSafeInteger(value.epoch) ||
    value.epoch < 0 ||
    !Number.isSafeInteger(value.version) ||
    value.version < 0
  )
    return false
  const signed = value.status === 'signed-in' || value.status === 'refreshing'
  return signed
    ? typeof value.accessToken === 'string' &&
        value.accessToken.length > 0 &&
        typeof value.sessionId === 'string' &&
        value.sessionId.length > 0 &&
        typeof value.accessExpiresAt === 'number' &&
        Number.isFinite(value.accessExpiresAt)
    : value.accessToken === null &&
        value.sessionId === null &&
        (value.status !== 'mfa-pending' ||
          (typeof value.mfaExpiresAt === 'number' && Number.isFinite(value.mfaExpiresAt)))
}
function unwrap<T>(result: IpcResult<T>): T {
  if (!result.ok) throw new AccountError('desktop')
  return result.data
}
export const useAuthStore = defineStore('auth', () => {
  const snapshot = shallowRef<AuthSnapshot>(signedOut())
  const user = shallowRef<AccountUser | null>(null)
  const authorization = shallowRef<AccountAuthorization | null>(null)
  const profileError = shallowRef<unknown>(null)
  const busy = shallowRef(false)
  const profileBusy = shallowRef(false)
  const signedIn = computed(
    () => snapshot.value.status === 'signed-in' || snapshot.value.status === 'refreshing',
  )
  let profileGeneration = 0
  let invalidatedEpoch = -1
  let stop: (() => void) | undefined
  function clearProfile() {
    profileGeneration++
    user.value = null
    authorization.value = null
    profileError.value = null
    profileBusy.value = false
  }
  function accept(value: AuthSnapshot) {
    if (!validSnapshot(value)) throw new AccountError('invalidResponse')
    const previous = snapshot.value
    if (value.epoch <= invalidatedEpoch && value.status !== 'signed-out') return
    if (
      value.epoch < previous.epoch ||
      (value.epoch === previous.epoch && value.version <= previous.version)
    )
      return
    const changed = value.epoch !== previous.epoch || value.sessionId !== previous.sessionId
    if (changed || !['signed-in', 'refreshing'].includes(value.status)) clearProfile()
    snapshot.value = { ...value }
    if (
      value.status === 'signed-in' &&
      (changed || previous.status !== 'signed-in') &&
      !profileBusy.value &&
      !user.value
    )
      void loadAccount()
  }
  async function refresh() {
    accept(unwrap(await ipcAuthRefresh()))
  }
  function clearSession() {
    invalidatedEpoch = Math.max(invalidatedEpoch, snapshot.value.epoch)
    snapshot.value = {
      ...signedOut(),
      epoch: snapshot.value.epoch,
      version: snapshot.value.version,
    }
    clearProfile()
  }
  async function expireSession() {
    clearSession()
    unwrap(await ipcAuthLogout())
    await synchronize()
  }
  async function loadAccount() {
    if (!signedIn.value) return
    const generation = ++profileGeneration
    const epoch = snapshot.value.epoch
    const sessionId = snapshot.value.sessionId
    const httpAuth = {
      getSnapshot: () => snapshot.value,
      refresh,
      async invalidate() {
        if (epoch !== snapshot.value.epoch || sessionId !== snapshot.value.sessionId) return
        await expireSession()
      },
    }
    profileBusy.value = true
    profileError.value = null
    try {
      const [nextUser, nextAuthorization] = await Promise.all([
        apiUserMe(httpAuth),
        apiUserAuthorization(httpAuth),
      ])
      if (
        generation !== profileGeneration ||
        epoch !== snapshot.value.epoch ||
        sessionId !== snapshot.value.sessionId
      )
        return
      if (nextUser.sessionId !== sessionId) throw new AccountError('invalidResponse')
      user.value = nextUser
      authorization.value = nextAuthorization
    } catch (error) {
      if (generation === profileGeneration) {
        user.value = null
        authorization.value = null
        profileError.value = error instanceof AccountError ? error : new AccountError('network')
      }
    } finally {
      if (generation === profileGeneration) profileBusy.value = false
    }
  }
  async function initialize() {
    if (!window.scnexus || stop) return
    try {
      stop = ipcAuthOnChanged((value) => {
        try {
          accept(value)
        } catch {
          profileError.value = new AccountError('invalidResponse')
        }
      })
      accept(unwrap(await ipcAuthGetSnapshot()))
    } catch {
      stop?.()
      stop = undefined
      profileError.value = new AccountError('desktop')
    }
  }
  function dispose() {
    stop?.()
    stop = undefined
  }
  async function operation(run: () => Promise<IpcResult<AuthSnapshot>>) {
    if (busy.value) return
    busy.value = true
    try {
      accept(unwrap(await run()))
    } finally {
      busy.value = false
    }
  }
  const login = (input: AuthLoginInput) => operation(() => ipcAuthLogin(input))
  const register = (input: AuthRegisterInput) => operation(() => ipcAuthRegister(input))
  const completeMfa = (input: AuthFactorInput) => operation(() => ipcAuthCompleteMfa(input))
  const requestChallenge = async (input: AuthChallengeInput) =>
    unwrap(await ipcAuthRequestChallenge(input))
  async function resetPassword(input: AuthResetInput) {
    unwrap(await ipcAuthResetPassword(input))
    await synchronize()
  }
  async function synchronize() {
    accept(unwrap(await ipcAuthGetSnapshot()))
  }
  async function logout() {
    if (busy.value) return
    busy.value = true
    clearSession()
    try {
      const result = unwrap(await ipcAuthLogout())
      await synchronize()
      return result
    } finally {
      busy.value = false
    }
  }
  return {
    snapshot,
    user,
    authorization,
    profileError,
    profileBusy,
    busy,
    signedIn,
    initialize,
    dispose,
    login,
    register,
    completeMfa,
    requestChallenge,
    resetPassword,
    logout,
    loadAccount,
  }
})
