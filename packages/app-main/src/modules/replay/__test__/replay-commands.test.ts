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
      selection: { unitTags: null, reason: 'unverified-protocol' },
    },
    {
      gameLoop: 180,
      userId: 4,
      abilityLink: null,
      abilityIndex: null,
      flags: 0,
      target: { kind: 'unknown' },
      selection: { unitTags: null, reason: 'unverified-protocol' },
    },
  ])
})

test('includes same-stream prior selection evidence without treating the target as an issuer', () => {
  const game: ReplayGameEvents = {
    baseBuild: 98310,
    protocolVersion: 's2protocol-98310',
    algorithmVersion: 'test',
    compatibility: { state: 'verified', protocolBuild: 98310, candidateBuilds: [98310] },
    processedEvents: 2,
    skippedEvents: 0,
    events: [
      {
        eventId: 28,
        eventType: 'NNet.Game.SSelectionDeltaEvent',
        gameLoop: 16,
        userId: 0,
        data: {
          m_controlGroupId: 10,
          m_delta: { m_removeMask: { None: null }, m_addUnitTags: [262146] },
        },
      },
      {
        eventId: 27,
        eventType: 'NNet.Game.SCmdEvent',
        gameLoop: 16,
        userId: 0,
        data: { m_data: { TargetUnit: { m_tag: 524290 } } },
      },
    ],
  }
  expect(buildReplayCommands(game)[0]).toMatchObject({
    selection: { unitTags: [262146], reason: null },
    target: { kind: 'unit', rawTag: 524290, unitTag: null },
  })
})
