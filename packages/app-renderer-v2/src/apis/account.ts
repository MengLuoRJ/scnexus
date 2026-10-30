import { AccountError, apiRequest, type ApiAuth } from './internal/client'

export type RegistrationPolicy = { invitationRequired: boolean }
export type AccountUser = {
  id: string
  nickname: string
  email: string | null
  sessionId: string
  clientType: 'DESKTOP'
  twoFactorEnabled: boolean
}
export type AccountAuthorization = { roles: string[]; permissions: string[] }
export type TwoFactorEnrollment = { secret: string; otpauthUri: string; expiresIn: number }
export type TwoFactorStatus = {
  twoFactorEnabled: boolean
  twoFactorVerified: boolean
  twoFactorVerifiedAt: string | null
  recoveryCodesRemaining: number
}
function recoveryCodes(value: unknown): string[] {
  const data = object(value)
  if (
    !Array.isArray(data.recoveryCodes) ||
    !data.recoveryCodes.length ||
    !data.recoveryCodes.every(
      (item) => typeof item === 'string' && /^[a-fA-F0-9]{32}$/.test(item),
    ) ||
    new Set(data.recoveryCodes.map((item: string) => item.toLowerCase())).size !==
    data.recoveryCodes.length
  )
    throw new Error('Invalid recovery codes')
  return [...data.recoveryCodes] as string[]
}
export const apiTwoFactorStatus = (auth: ApiAuth) =>
  apiRequest(
    '/auth/two-factor',
    (value): TwoFactorStatus => {
      const data = object(value)
      if (
        typeof data.twoFactorEnabled !== 'boolean' ||
        typeof data.twoFactorVerified !== 'boolean' ||
        (data.twoFactorVerifiedAt !== null &&
          (typeof data.twoFactorVerifiedAt !== 'string' ||
            !Number.isFinite(Date.parse(data.twoFactorVerifiedAt)))) ||
        !Number.isSafeInteger(data.recoveryCodesRemaining) ||
        (data.recoveryCodesRemaining as number) < 0 ||
        (data.twoFactorVerified && (!data.twoFactorEnabled || data.twoFactorVerifiedAt === null))
      )
        throw new Error('Invalid two-factor status')
      return {
        twoFactorEnabled: data.twoFactorEnabled,
        twoFactorVerified: data.twoFactorVerified,
        twoFactorVerifiedAt: data.twoFactorVerifiedAt as string | null,
        recoveryCodesRemaining: data.recoveryCodesRemaining as number,
      }
    },
    auth,
  )
export type TwoFactorProof =
  | { code: string; recoveryCode?: never }
  | { recoveryCode: string; code?: never }
function enrollment(value: unknown): TwoFactorEnrollment {
  const data = object(value)
  if (
    typeof data.secret !== 'string' ||
    !/^[A-Z2-7]+$/.test(data.secret) ||
    typeof data.otpauthUri !== 'string' ||
    !Number.isSafeInteger(data.expiresIn) ||
    (data.expiresIn as number) <= 0
  )
    throw new Error('Invalid enrollment')
  const uri = new URL(data.otpauthUri)
  if (
    uri.protocol !== 'otpauth:' ||
    uri.hostname !== 'totp' ||
    uri.searchParams.get('secret') !== data.secret
  )
    throw new Error('Invalid enrollment URI')
  return { secret: data.secret, otpauthUri: data.otpauthUri, expiresIn: data.expiresIn as number }
}
function factor(proof: TwoFactorProof): TwoFactorProof {
  if (
    typeof proof?.code === 'string' &&
    /^\d{6}$/.test(proof.code) &&
    proof.recoveryCode === undefined
  )
    return { code: proof.code }
  if (
    typeof proof?.recoveryCode === 'string' &&
    /^[a-fA-F0-9]{32}$/.test(proof.recoveryCode) &&
    proof.code === undefined
  )
    return { recoveryCode: proof.recoveryCode }
  throw new AccountError('badRequest')
}
export async function apiTwoFactorRotate(auth: ApiAuth, proof: TwoFactorProof) {
  return apiRequest('/auth/two-factor/rotate', enrollment, auth, 'POST', factor(proof), undefined, {
    preserveSessionOnUnauthorized: true,
  })
}
export async function apiTwoFactorRegenerate(auth: ApiAuth, proof: TwoFactorProof) {
  return apiRequest(
    '/auth/two-factor/recovery-codes',
    recoveryCodes,
    auth,
    'POST',
    factor(proof),
    undefined,
    {
      preserveSessionOnUnauthorized: true,
    },
  )
}
export async function apiTwoFactorVerify(auth: ApiAuth, proof: TwoFactorProof) {
  return apiRequest(
    '/auth/two-factor/verify',
    (value): number => {
      const data = object(value)
      if (
        data.verified !== true ||
        !Number.isSafeInteger(data.expiresIn) ||
        (data.expiresIn as number) <= 0 ||
        (data.expiresIn as number) > 300
      )
        throw new Error('Invalid verification response')
      return data.expiresIn as number
    },
    auth,
    'POST',
    factor(proof),
    undefined,
    { preserveSessionOnUnauthorized: true },
  )
}
export async function apiTwoFactorDisable(auth: ApiAuth, proof: TwoFactorProof) {
  return apiRequest(
    '/auth/two-factor/disable',
    (value): void => {
      const data = object(value)
      if (data.twoFactorEnabled !== false || data.reauthenticationRequired !== true)
        throw new Error('Invalid disable response')
    },
    auth,
    'POST',
    factor(proof),
    undefined,
    { preserveSessionOnUnauthorized: true },
  )
}
export const apiTwoFactorEnroll = (auth: ApiAuth) =>
  apiRequest('/auth/two-factor/enroll', enrollment, auth, 'POST')
export function apiTwoFactorConfirm(auth: ApiAuth, code: string) {
  if (!/^\d{6}$/.test(code)) return Promise.reject(new AccountError('badRequest'))
  return apiRequest(
    '/auth/two-factor/confirm',
    (value): string[] => {
      const data = object(value)
      if (data.twoFactorEnabled !== true || !Array.isArray(data.recoveryCodes))
        throw new Error('Invalid recovery codes')
      return recoveryCodes(data)
    },
    auth,
    'POST',
    { code },
    undefined,
    { preserveSessionOnUnauthorized: true },
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid response')
  return value as Record<string, unknown>
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const apiRegistrationPolicy = () =>
  apiRequest('/registration-policy', (value): RegistrationPolicy => {
    const data = object(value)
    if (typeof data.invitationRequired !== 'boolean') throw new Error('Invalid policy')
    return { invitationRequired: data.invitationRequired }
  })
// Known contract gap: OpenAPI d336c7f has no successful response schemas for these two endpoints.
// Runtime projections follow docs/client/electron.md, section “当前用户与授权”; do not infer profile fields.
export const apiUserMe = (auth: ApiAuth) =>
  apiRequest(
    '/users/me',
    (value): AccountUser => {
      const data = object(value)
      if (
        typeof data.nickname !== 'string' ||
        !data.nickname.length ||
        (data.email !== null && typeof data.email !== 'string') ||
        typeof data.id !== 'string' ||
        !uuid.test(data.id) ||
        typeof data.sessionId !== 'string' ||
        !uuid.test(data.sessionId) ||
        data.clientType !== 'DESKTOP' ||
        typeof data.twoFactorEnabled !== 'boolean'
      )
        throw new Error('Invalid user')
      return {
        id: data.id,
        nickname: data.nickname,
        email: data.email as string | null,
        sessionId: data.sessionId,
        clientType: data.clientType,
        twoFactorEnabled: data.twoFactorEnabled,
      }
    },
    auth,
  )
export const apiUserAuthorization = (auth: ApiAuth) =>
  apiRequest(
    '/users/me/authorization',
    (value): AccountAuthorization => {
      const data = object(value)
      const strings = (value: unknown): value is string[] =>
        Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
      if (!strings(data.roles) || !strings(data.permissions))
        throw new Error('Invalid authorization')
      return { roles: [...data.roles], permissions: [...data.permissions] }
    },
    auth,
  )
