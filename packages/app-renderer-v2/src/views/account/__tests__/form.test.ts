import { describe, expect, it } from 'vitest'
import { isStrongPassword } from '@scnexus/app-shared/utils/auth-password'
import { challengeState, validSubject, validateAccount } from '../form'
import type { AccountFields, AccountMode, ChallengeState } from '../form'

const now = 1000
const fields: AccountFields = {
  subject: 'a@b.com',
  password: 'StrongPass1!',
  deviceName: 'PC',
  proof: '012345',
  invitationCode: '',
}
const challenge: ChallengeState = {
  accepted: true,
  challengeId: 'aabbccdd-1234-4567-8901-aabbccddeeff',
  expiresIn: 600,
  retryAfter: 60,
  subject: fields.subject,
  purpose: 'REGISTER',
  expiresAt: now + 600000,
  retryAt: now + 60000,
}
const error = (name: string) => ({ name, message: `account.validation.${name}` })
const check = (
  input: AccountFields,
  mode: AccountMode = 'register',
  required = false,
  currentChallenge: ChallengeState | null = challenge,
) => validateAccount(input, mode, required, currentChallenge, now)

describe('account input schemas', () => {
  it.each<AccountMode>(['login', 'register', 'reset'])('accepts valid %s input', (mode) => {
    expect(
      check(fields, mode, false, {
        ...challenge,
        purpose: mode === 'reset' ? 'RESET' : 'REGISTER',
      }),
    ).toEqual([])
  })

  it.each([
    ['a@b.c', true],
    [`${'a'.repeat(248)}@b.com`, true],
    [`${'a'.repeat(249)}@b.com`, false],
    [' a@b.com', false],
    ['a@b.com ', false],
    ['a@b', false],
    ['a@@b.com', false],
    ['', false],
  ])('preserves subject rules for %s', (subject, valid) => {
    expect(validSubject(subject)).toBe(valid)
    expect(check({ ...fields, subject }, 'login')).toEqual(valid ? [] : [error('subject')])
  })

  it.each([
    ['', false],
    [' ', true],
    ['a', true],
    ['a'.repeat(128), true],
    ['a'.repeat(129), false],
  ])('retains legacy login password bounds: %s', (password, valid) => {
    expect(check({ ...fields, password }, 'login')).toEqual(valid ? [] : [error('password')])
  })

  it.each(['register', 'reset'] as const)('uses shared new-password rules for %s', (mode) => {
    for (const password of [
      'Abc123!x',
      `Aa1!${'a'.repeat(124)}`,
      `Aa1!${'a'.repeat(125)}`,
      'Abc12!x',
      'abcdefgh1!',
      'ABCDEFGH1!',
      'Abcdefgh!',
      'Abcdefg1 ',
      ' StrongPass1! ',
      'StrongPass1!中',
    ]) {
      const input = { ...fields, password }
      const before = { ...input }
      const errors = check(input, mode, false, {
        ...challenge,
        purpose: mode === 'reset' ? 'RESET' : 'REGISTER',
      })
      expect(errors).toEqual(isStrongPassword(password) ? [] : [error('password')])
      expect(input).toEqual(before)
    }
  })

  it.each(['login', 'register'] as const)('checks device name bounds for %s', (mode) => {
    for (const deviceName of ['', ' ', 'a'.repeat(80), 'a'.repeat(81)]) {
      expect(check({ ...fields, deviceName }, mode)).toEqual(
        deviceName.length >= 1 && deviceName.length <= 80 ? [] : [error('deviceName')],
      )
    }
  })

  it('ignores inactive inputs and extra object properties', () => {
    expect(
      check(
        { ...fields, proof: '', invitationCode: ' invalid ', extra: true } as AccountFields,
        'login',
        true,
        null,
      ),
    ).toEqual([])
    expect(
      check({ ...fields, deviceName: '', invitationCode: ' invalid ' }, 'reset', true, {
        ...challenge,
        purpose: 'RESET',
      }),
    ).toEqual([])
  })

  it.each(['register', 'reset'] as const)('requires six ASCII proof digits for %s', (mode) => {
    for (const proof of [
      '012345',
      '000000',
      '12345',
      '1234567',
      ' 123456',
      '１２３４５６',
      '12345a',
    ]) {
      expect(
        check({ ...fields, proof }, mode, false, {
          ...challenge,
          purpose: mode === 'reset' ? 'RESET' : 'REGISTER',
        }),
      ).toEqual(/^[0-9]{6}$/.test(proof) ? [] : [error('proof')])
    }
  })

  it.each(['register', 'reset'] as const)(
    'pairs %s challenge with subject, purpose and expiry',
    (mode) => {
      const valid = {
        ...challenge,
        purpose: mode === 'reset' ? ('RESET' as const) : ('REGISTER' as const),
      }
      for (const invalid of [
        null,
        { ...valid, subject: 'other@b.com' },
        { ...valid, purpose: mode === 'reset' ? ('REGISTER' as const) : ('RESET' as const) },
        { ...valid, expiresAt: now },
        { ...valid, expiresAt: now - 1 },
      ]) {
        expect(check(fields, mode, false, invalid)).toEqual([error('challenge')])
      }
      expect(check(fields, mode, false, { ...valid, expiresAt: now + 1 })).toEqual([])
    },
  )

  it.each([false, true])('validates required=%s invitations without trimming', (required) => {
    for (const invitationCode of [
      '',
      'a'.repeat(7),
      'a'.repeat(8),
      'a'.repeat(64),
      'a'.repeat(65),
      'Ab12_-xy',
      ' valid123 ',
      '中文123456',
    ]) {
      const valid = invitationCode === '' ? !required : /^[A-Za-z0-9_-]{8,64}$/.test(invitationCode)
      const input = { ...fields, invitationCode }
      expect(check(input, 'register', required)).toEqual(valid ? [] : [error('invitationCode')])
      expect(input.invitationCode).toBe(invitationCode)
    }
  })

  it('returns one localized error per field in the original order', () => {
    expect(
      check(
        { subject: '', password: '', deviceName: '', proof: '', invitationCode: '' },
        'register',
        true,
        null,
      ),
    ).toEqual(
      ['subject', 'password', 'deviceName', 'proof', 'challenge', 'invitationCode'].map(error),
    )
  })

  it('rejects incorrect runtime input types through the schema', () => {
    expect(check({ ...fields, password: 123 } as unknown as AccountFields, 'login')).toEqual([
      error('password'),
    ])
  })
})

describe('challenge response handling remains separate', () => {
  it('preserves response validation and minimum retry delay', () => {
    const response = {
      accepted: true as const,
      challengeId: challenge.challengeId,
      expiresIn: 10,
      retryAfter: 0,
    }
    expect(challengeState(response, fields.subject, 'RESET', now)).toMatchObject({
      subject: fields.subject,
      purpose: 'RESET',
      expiresAt: now + 10000,
      retryAt: now + 60000,
    })
    for (const invalid of [
      { ...response, expiresIn: Infinity },
      { ...response, expiresIn: 0 },
      { ...response, retryAfter: -1 },
      { ...response, retryAfter: NaN },
      { ...response, challengeId: 'invalid' },
    ]) {
      expect(() => challengeState(invalid, fields.subject, 'RESET', now)).toThrow(
        'Invalid challenge',
      )
    }
  })
})
