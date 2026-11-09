import { expect, test } from 'vitest'
import type { ReplayGameEvents } from '@scnexus/replay-parser'
import { buildReplayCommands } from '../replay-commands'

test('projects raw commands without conflating game user IDs with tracker players', () => {
  const events = [
    {
      eventType: 'NNet.Game.SCmdEvent',
      gameLoop: 160,
      userId: 0,
      data: { m_abil: { m_abilLink: 123, m_abilCmdIndex: 2 }, m_cmdFlags: 256 },
    },
    { eventType: 'NNet.Game.SSelectionDeltaEvent', gameLoop: 170, userId: 0, data: {} },
    {
      eventType: 'NNet.Game.SCmdEvent',
      gameLoop: 180,
      userId: 4,
      data: { m_abil: null, m_cmdFlags: 0 },
    },
  ]
  expect(buildReplayCommands({ events } as ReplayGameEvents)).toEqual([
    {
      gameLoop: 160,
      userId: 0,
      abilityLink: 123,
      abilityIndex: 2,
      flags: 256,
      target: { kind: 'unknown' },
    },
    {
      gameLoop: 180,
      userId: 4,
      abilityLink: null,
      abilityIndex: null,
      flags: 0,
      target: { kind: 'unknown' },
    },
  ])
})
