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
