import { expect, test } from 'vitest'
import type { ReplayAttributes, ReplayInitData } from '@scnexus/replay-parser'
import { isStandardReplayMelee } from '../replay-production-scope'

const players = [1, 2].map((slot) => ({ slot, team: slot, name: null, race: null, result: null }))
const attributes = {
  attributes: [
    { scope: 16, attributeId: 3009, value: 'Amm' },
    { scope: 16, attributeId: 2001, value: '1v1' },
  ],
} as ReplayAttributes
function init(overrides: Record<string, unknown> = {}): ReplayInitData {
  return {
    data: {
      m_syncLobbyState: {
        m_gameDescription: {
          m_isBlizzardMap: true,
          m_isCoopMode: false,
          m_hasExtensionMod: false,
          m_gameOptions: { m_cooperative: false, m_amm: true },
          ...overrides,
        },
      },
    },
  } as ReplayInitData
}
test('requires explicit standard map, ranked matchmaking and different teams', () => {
  expect(isStandardReplayMelee(init(), attributes, players)).toBe(true)
  expect(isStandardReplayMelee(null, attributes, players)).toBe(false)
  expect(isStandardReplayMelee(init(), null, players)).toBe(false)
  expect(isStandardReplayMelee(init(), attributes, [players[0]!, players[0]!])).toBe(false)
})
test.each([
  { m_isBlizzardMap: false },
  { m_isCoopMode: true },
  { m_hasExtensionMod: true },
  { m_gameOptions: { m_cooperative: true, m_amm: true } },
  { m_gameOptions: { m_cooperative: false, m_amm: false } },
])('does not apply duration tables to unsupported lobby evidence %j', (overrides) => {
  expect(isStandardReplayMelee(init(overrides), attributes, players)).toBe(false)
})
