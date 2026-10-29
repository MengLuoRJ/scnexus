import type { IpcResult } from '../errors/app.error.js'

export type AuthStatus =
  | 'signed-out'
  | 'authenticating'
  | 'mfa-pending'
  | 'signed-in'
  | 'refreshing'
export type AuthSnapshot = {
  status: AuthStatus
  epoch: number
  version: number
  accessToken: string | null
  accessExpiresAt: number | null
  sessionId: string | null
  clientId?: string | null
  userId?: string | null
  sessionExpiresAt: string | null
  mfaExpiresAt: number | null
}
export type AuthLoginInput = { subject: string; password: string; deviceName: string }
export type AuthRegisterInput = AuthLoginInput & {
  challengeId: string
  proof: string
  invitationCode?: string
}
export type AuthFactorInput =
  | { code: string; recoveryCode?: never }
  | { recoveryCode: string; code?: never }
export type AuthChallengeInput = { subject: string; purpose: 'REGISTER' | 'RESET' }
export type AuthChallenge = {
  accepted: true
  challengeId: string
  expiresIn: number
  retryAfter: number
}
export type AuthResetInput = { challengeId: string; proof: string; password: string }
export type AuthApi = {
  getSnapshot(): Promise<IpcResult<AuthSnapshot>>
  login(input: AuthLoginInput): Promise<IpcResult<AuthSnapshot>>
  register(input: AuthRegisterInput): Promise<IpcResult<AuthSnapshot>>
  completeMfa(input: AuthFactorInput): Promise<IpcResult<AuthSnapshot>>
  requestChallenge(input: AuthChallengeInput): Promise<IpcResult<AuthChallenge>>
  resetPassword(input: AuthResetInput): Promise<IpcResult<{ success: true }>>
  refresh(): Promise<IpcResult<AuthSnapshot>>
  logout(): Promise<IpcResult<{ remoteRevoked: boolean }>>
  onChanged(listener: (snapshot: AuthSnapshot) => void): () => void
}
