import { describe, expect, it } from 'vitest'
import { isStrongPassword } from '@scnexus/app-shared/utils/auth-password'
import { loginInput } from '../validation'

const input = { subject: 'test@example.com', deviceName: 'Desktop' }
const registration = {
  ...input,
  challengeId: '7d6b0c48-40c8-4ae0-9197-95e41f11cced',
  proof: '012345',
}

describe('shared password rules', () => {
  it.each([
    ['Strong1!', true],
    ['Aa1!'.padEnd(128, 'x'), true],
    ['Aa1!'.padEnd(129, 'x'), false],
    ['Aa1!xxx', false],
    ['strong1!', false],
    ['STRONG1!', false],
    ['Strong!!', false],
    ['Strong12', false],
    ['Strong1 ', false],
    ['Strong1中', false],
    ['Strong1\t', false],
    ['Strong1！', false],
    [' Aa1!xx ', true],
  ])('validates %j without rewriting', (password, valid) => {
    expect(isStrongPassword(password)).toBe(valid)
    let actual: unknown
    try {
      actual = loginInput({ ...registration, password }, true).password
    } catch (error) {
      actual = (error as Error).message
    }
    expect(actual).toBe(valid ? password : 'Invalid account input')
  })
  it('accepts all ASCII punctuation ranges', () => {
    for (let code = 33; code <= 126; code++) {
      if (/[A-Za-z0-9]/.test(String.fromCharCode(code))) continue
      expect(isStrongPassword(`Strong1${String.fromCharCode(code)}`)).toBe(true)
    }
  })
  it('keeps legacy login lengths and passwords untouched', () => {
    for (const password of ['x', 'weak password', ' '.repeat(128)]) {
      expect(loginInput({ ...input, password }).password).toBe(password)
    }
    for (const password of ['', 'x'.repeat(129)]) {
      expect(() => loginInput({ ...input, password })).toThrow('Invalid account input')
    }
  })
})
