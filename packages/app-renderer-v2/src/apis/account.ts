import { apiRequest, type ApiAuth } from './internal/client'

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
