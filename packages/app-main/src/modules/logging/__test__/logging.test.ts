import { test } from 'vitest'
import assert from 'node:assert/strict'
import { redact } from '../redact'
test('logger redacts tokens, bearer authorization and authentication URLs', () => {
  for (const input of [
    'authorization: Bearer secret-value',
    'access_token=secret-value',
    'refresh_token: secret-value',
    'accessToken=secret-value',
    'refreshToken: secret-value',
    'proof=secret-value',
    'recoveryCode=secret-value',
    'otpauthUri=secret-value',
    'password=secret-value',
    'scnexus://authentication?access_token=secret-value',
  ]) {
    assert.equal(redact(input).includes('secret-value'), false)
  }
})
test('redacts recovery arrays, free-standing credentials, email and home directories', () => {
  for (const [input, secrets] of [
    [
      JSON.stringify({ recoveryCodes: ['a'.repeat(32), 'b'.repeat(32)] }),
      ['a'.repeat(32), 'b'.repeat(32)],
    ],
    ['recoveryCodes = [\n"synthetic-code",\n"other-code"\n]', ['synthetic-code', 'other-code']],
    ['Bearer synthetic-bearer', ['synthetic-bearer']],
    ['eyJhbGciOiJIUzI1NiJ9.synthetic.signature', ['eyJhbGciOiJIUzI1NiJ9.synthetic.signature']],
    ['otpauth://totp/SCNexus?secret=SYNTHETIC&issuer=test', ['SYNTHETIC']],
    ['https://example.invalid?access_token=synthetic-token&next=test', ['synthetic-token']],
    ['C:\\Users\\SyntheticUser\\Documents\\game', ['SyntheticUser']],
    ['/Users/SyntheticUser/game /home/SyntheticLinux/game', ['SyntheticUser', 'SyntheticLinux']],
    ['synthetic@example.invalid', ['synthetic@example.invalid']],
  ] as [string, string[]][]) {
    const result = redact(input)
    for (const secret of secrets) assert.equal(result.includes(secret), false, result)
  }
})
