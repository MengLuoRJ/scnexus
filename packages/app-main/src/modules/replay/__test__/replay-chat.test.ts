import { expect, test } from 'vitest'
import type { ReplayMessageEvents, ReplayTrackerEvents } from '@scnexus/replay-parser'
import { buildReplayChat } from '../replay-chat'

function messages(userId = 7, verified = true): ReplayMessageEvents {
  return {
    baseBuild: 98310,
    protocolVersion: 'message-test',
    algorithmVersion: 'test',
    compatibility: {
      state: verified ? 'verified' : 'unverified',
      protocolBuild: 98310,
      candidateBuilds: [98310],
    },
    processedEvents: 1,
    skippedEvents: 0,
    elapsedGameLoops: 160,
    events: [
      {
        eventId: 0,
        eventType: 'NNet.Game.SChatMessage',
        gameLoop: 160,
        userId,
        data: { m_recipient: 2, m_string: { kind: 'blob', hex: '', text: '<img src=x> hello' } },
      },
    ],
  }
}
function tracker(userId = 7): ReplayTrackerEvents {
  return {
    baseBuild: 98310,
    protocolVersion: 'test',
    algorithmVersion: 'test',
    events: [
      {
        eventId: 9,
        eventType: 'NNet.Replay.Tracker.SPlayerSetupEvent',
        gameLoop: 0,
        data: { m_playerId: 3, m_slotId: 1, m_userId: userId },
      },
    ],
  } as ReplayTrackerEvents
}
const players = [{ slot: 2, name: 'Player', race: null, team: 1, result: null }]

test('maps chat via setup namespaces instead of userId plus one and preserves text', () => {
  expect(buildReplayChat(messages(), tracker(), players)).toMatchObject({
    state: 'available',
    messages: [
      {
        playerId: 3,
        userId: 7,
        slot: 2,
        name: 'Player',
        recipient: 2,
        text: '<img src=x> hello',
        gameLoop: 160,
      },
    ],
  })
})
test('retains unmapped users without inventing names', () => {
  expect(buildReplayChat(messages(), null, players)).toMatchObject({
    state: 'partial',
    messages: [{ playerId: null, slot: null, name: null, userId: 7 }],
  })
})
test('distinguishes missing component from valid empty chat', () => {
  expect(buildReplayChat(null, null, players)).toEqual({
    state: 'unavailable',
    messages: [],
    warnings: [],
  })
  expect(buildReplayChat({ ...messages(), events: [] }, null, players)).toEqual({
    state: 'available',
    messages: [],
    warnings: [],
  })
})
test('marks candidate-decoded chat partial and rejects conflicting user associations', () => {
  expect(buildReplayChat(messages(7, false), tracker(), players).state).toBe('partial')
  const setup = tracker()
  setup.events.push({ ...setup.events[0]!, data: { m_playerId: 4, m_slotId: 2, m_userId: 7 } })
  expect(buildReplayChat(messages(), setup, players).messages[0]).toMatchObject({
    playerId: null,
    name: null,
  })
})

test('rejects two users mapped to the same lobby slot', () => {
  const setup = tracker()
  setup.events.push({ ...setup.events[0]!, data: { m_playerId: 4, m_slotId: 1, m_userId: 8 } })
  expect(buildReplayChat(messages(), setup, players).messages[0]).toMatchObject({
    playerId: null,
    name: null,
  })
})
