import { z } from 'zod'
import { isStrongPassword } from '@scnexus/app-shared/utils/auth-password'
import type { AuthChallenge } from '@scnexus/app-shared/types/auth.type'

export type AccountMode = 'login' | 'register' | 'reset'
export type AccountFields = {
  subject: string
  password: string
  deviceName: string
  proof: string
  invitationCode: string
}
export type ChallengeState = AuthChallenge & {
  subject: string
  purpose: 'REGISTER' | 'RESET'
  expiresAt: number
  retryAt: number
}
const subjectSchema = z
  .string()
  .min(3)
  .max(254)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
const newPasswordSchema = z.string().refine(isStrongPassword)
const invitationSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)
const errorNames = ['subject', 'password', 'deviceName', 'proof', 'challenge', 'invitationCode']

export function validFactor(type: string, value: string): boolean {
  return (
    type === 'otp' ? z.string().regex(/^[0-9]{6}$/) : z.string().regex(/^[a-fA-F0-9]{32}$/)
  ).safeParse(value).success
}
export function validSubject(value: string) {
  return subjectSchema.safeParse(value).success
}
export function validateAccount(
  fields: AccountFields,
  mode: AccountMode,
  required: boolean,
  challenge: ChallengeState | null,
  now: number,
) {
  const schema = z
    .object({
      subject: subjectSchema,
      password: mode === 'login' ? z.string().min(1).max(128) : newPasswordSchema,
      ...(mode !== 'reset' ? { deviceName: z.string().min(1).max(80) } : {}),
      ...(mode !== 'login' ? { proof: z.string().regex(/^[0-9]{6}$/) } : {}),
      ...(mode === 'register'
        ? { invitationCode: required ? invitationSchema : invitationSchema.or(z.literal('')) }
        : {}),
    })
    .superRefine((input, context) => {
      if (
        mode !== 'login' &&
        (!challenge ||
          challenge.subject !== input.subject ||
          challenge.purpose !== (mode === 'register' ? 'REGISTER' : 'RESET') ||
          challenge.expiresAt <= now)
      )
        context.addIssue({
          code: 'custom',
          path: ['challenge'],
          message: 'account.validation.challenge',
        })
    })
  const result = schema.safeParse(fields)
  if (result.success) return []
  const invalidNames = new Set(result.error.issues.map((issue) => issue.path[0]))
  return errorNames
    .filter((name) => invalidNames.has(name))
    .map((name) => ({ name, message: `account.validation.${name}` }))
}
export function challengeState(
  value: AuthChallenge,
  subject: string,
  purpose: 'REGISTER' | 'RESET',
  now: number,
): ChallengeState {
  if (
    value.accepted !== true ||
    !/^[0-9a-f-]{36}$/i.test(value.challengeId) ||
    !Number.isFinite(value.expiresIn) ||
    value.expiresIn <= 0 ||
    !Number.isFinite(value.retryAfter) ||
    value.retryAfter < 0
  )
    throw new Error('Invalid challenge')
  return {
    ...value,
    subject,
    purpose,
    expiresAt: now + value.expiresIn * 1000,
    retryAt: now + Math.max(60, value.retryAfter) * 1000,
  }
}
