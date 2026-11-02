import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { readReplaySelection, saveReplaySelection } from '../selection'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

test('remembers only profile handle and category across reads', () => {
  const scope = { profileHandle: '5-S2-1-2206060', category: 'Campaign' as const }
  saveReplaySelection(scope)
  expect(readReplaySelection()).toEqual(scope)
  expect(JSON.parse(localStorage.getItem('scnexus.replay.selection')!)).toEqual(scope)
})

test('remembers the virtual co-op category', () => {
  const scope = { profileHandle: '5-S2-1-123', category: 'Coop' as const }
  saveReplaySelection(scope)
  expect(readReplaySelection()).toEqual(scope)
})

test.each([
  'not-json',
  'null',
  '{}',
  '{"profileHandle":"../bad","category":"Campaign"}',
  '{"profileHandle":"5-S2-1-1","category":"other"}',
])('invalid renderer state is ignored (%s)', (raw) => {
  localStorage.setItem('scnexus.replay.selection', raw)
  expect(readReplaySelection()).toBeNull()
})

test('unavailable storage does not prevent profile selection', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked')
  })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('full')
  })
  expect(readReplaySelection()).toBeNull()
  expect(() =>
    saveReplaySelection({ profileHandle: '1-S2-1-1', category: 'Multiplayer' }),
  ).not.toThrow()
})
