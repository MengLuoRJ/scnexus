import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { isStrongPassword } from '@scnexus/app-shared/utils/auth-password'

export function failure() {
  return new AppError(ERRORS.IPC_TRANSPORT_FAILED, { message: 'Account operation failed' })
}
export function invalid(): never {
  throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: 'Invalid account input' })
}
export function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
  input = true,
): Record<string, unknown> {
  const reject = () => {
    if (input) invalid()
    throw failure()
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return reject()
  const data = value as Record<string, unknown>
  if (
    required.some((key) => !Object.hasOwn(data, key)) ||
    Object.keys(data).some((key) => ![...required, ...optional].includes(key))
  )
    return reject()
  return data
}
export function text(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max
}
export function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}
export function clientUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}
export function otp(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9]{6}$/.test(value)
}
export function email(value: unknown): value is string {
  return text(value, 3, 254) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}
export function loginInput(value: unknown, register = false) {
  const data = object(
    value,
    ['subject', 'password', 'deviceName', ...(register ? ['challengeId', 'proof'] : [])],
    register ? ['invitationCode'] : [],
  )
  if (
    !email(data.subject) ||
    !text(data.password, 1, 128) ||
    (register && !isStrongPassword(data.password)) ||
    !text(data.deviceName, 1, 80)
  )
    invalid()
  if (
    register &&
    (!uuid(data.challengeId) ||
      !otp(data.proof) ||
      ('invitationCode' in data &&
        !(
          typeof data.invitationCode === 'string' &&
          /^[A-Za-z0-9_-]{8,64}$/.test(data.invitationCode)
        )))
  )
    invalid()
  return data
}
export type TokenPair = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  sessionId: string
  clientId?: string | null
  sessionExpiresAt: string
}
export function tokenPair(value: unknown, now: number): TokenPair {
  const data = object(
    value,
    ['accessToken', 'refreshToken', 'expiresIn', 'sessionId', 'sessionExpiresAt'],
    ['clientId'],
    false,
  )
  const expiry = typeof data.sessionExpiresAt === 'string' ? Date.parse(data.sessionExpiresAt) : NaN
  if (
    !text(data.accessToken, 1, 16384) ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.accessToken) ||
    typeof data.refreshToken !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(data.refreshToken) ||
    data.expiresIn !== 600 ||
    !uuid(data.sessionId) ||
    ('clientId' in data && data.clientId !== null && !clientUuid(data.clientId)) ||
    !Number.isFinite(expiry) ||
    expiry <= now ||
    expiry > now + 31 * 86400000 ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(
      String(data.sessionExpiresAt),
    )
  )
    throw failure()
  return data as TokenPair
}
export function refreshSecret(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}
