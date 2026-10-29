import assert from 'node:assert/strict'
import { test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendWhenReady: vi.fn<(channel: string, data: unknown) => void>(),
  setAsDefaultProtocolClient: vi.fn<(...args: unknown[]) => boolean>(),
}))
vi.mock('electron', () => ({
  app: { setAsDefaultProtocolClient: mocks.setAsDefaultProtocolClient },
}))
vi.mock('@/modules/window', () => ({ sendWhenReady: mocks.sendWhenReady }))
import { parseDeepLink } from '../deep-link-url'

test('authentication links preserve decoded tokens and nullable missing tokens', () => {
  assert.deepEqual(
    parseDeepLink('scnexus://authentication?access_token=a%2Bb&refresh_token=c%26d'),
    {
      channel: 'deeplink:authentication',
      data: { access_token: 'a+b', refresh_token: 'c&d' },
    },
  )
  assert.deepEqual(parseDeepLink('scnexus://authentication'), {
    channel: 'deeplink:authentication',
    data: { access_token: null, refresh_token: null },
  })
})

test.each([
  ['scnexus://workshop/1', { scnid: 1, download: false }],
  ['scnexus://workshop/2147483647', { scnid: 2147483647, download: false }],
  ['scnexus://workshop/42?download=true', { scnid: 42, download: true }],
  ['scnexus://workshop/42?download=false', { scnid: 42, download: false }],
])('workshop link %s produces a navigation DTO', (input, data) => {
  assert.deepEqual(parseDeepLink(input), { channel: 'deeplink:workshop', data })
})

test.each([
  '',
  '/',
  'item-id',
  '0',
  '-1',
  '+1',
  '01',
  '1.0',
  '1e2',
  '2147483648',
  '999999999999999999999999999',
  '%31',
  '1/',
  '1/2',
  '1/../2',
  '%2e%2e/2',
  '1?download',
  '1?download=',
  '1?download=1',
  '1?download=True',
  '1?download=true&download=true',
  '1?download=false&download=true',
  '1?download=true&extra=1',
  '1?install=true',
  '1?',
  '1#',
  '1#fragment',
  '1?download=true#fragment',
  '1?%64ownload=true',
  '1?download=%74rue',
  '1\n',
  '1\t',
])('rejects malformed workshop path/query %j', (suffix) => {
  assert.equal(parseDeepLink(`scnexus://workshop/${suffix}`), undefined)
})

test('invalid, foreign and lookalike links are ignored', () => {
  for (const input of [
    '',
    'not a URL',
    'https://authentication',
    'scnexus://authentication.attacker',
    'scnexus://workshop.attacker/item',
    'scnexus://user@authentication',
    'scnexus://workshop:80/item',
    'scnexus://unknown',
    'scnexus://worshop/1?install=true',
    'scnexus://workshop',
    'scnexus:workshop/1',
    'scnexus://workshop\\1',
  ]) {
    assert.equal(parseDeepLink(input), undefined, input)
  }
})

test('cold-start queue preserves authentication/workshop order and initialization is idempotent', async () => {
  vi.resetModules()
  mocks.sendWhenReady.mockClear()
  mocks.setAsDefaultProtocolClient.mockClear()
  const { captureDeepLink, initializeDeepLink } = await import('../deep-link')
  captureDeepLink('scnexus://authentication?access_token=token')
  captureDeepLink('scnexus://workshop/42?download=true')
  captureDeepLink('scnexus://workshop/item-id')
  assert.equal(mocks.sendWhenReady.mock.calls.length, 0)
  initializeDeepLink()
  initializeDeepLink()
  assert.equal(mocks.setAsDefaultProtocolClient.mock.calls.length, 1)
  assert.deepEqual(mocks.sendWhenReady.mock.calls, [
    ['deeplink:authentication', { access_token: 'token', refresh_token: null }],
    ['deeplink:workshop', { scnid: 42, download: true }],
  ])
  captureDeepLink('scnexus://workshop/1')
  assert.deepEqual(mocks.sendWhenReady.mock.calls.at(-1), [
    'deeplink:workshop',
    { scnid: 1, download: false },
  ])
})

test('cold-start queue keeps its bound and invalid links do not consume capacity', async () => {
  vi.resetModules()
  mocks.sendWhenReady.mockClear()
  const { captureDeepLink, initializeDeepLink } = await import('../deep-link')
  for (let scnid = 1; scnid <= 32; scnid++) {
    captureDeepLink('scnexus://workshop/0')
    captureDeepLink(`scnexus://workshop/${scnid}`)
  }
  assert.throws(() => captureDeepLink('scnexus://workshop/33'))
  initializeDeepLink()
  assert.equal(mocks.sendWhenReady.mock.calls.length, 32)
  assert.deepEqual(
    mocks.sendWhenReady.mock.calls.map(([, data]) => data.scnid),
    Array.from({ length: 32 }, (_, index) => index + 1),
  )
})
