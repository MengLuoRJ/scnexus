import { expect, it, vi } from 'vitest'
vi.mock('../src/protocols/game-registry.js', async () => {
  const actual = await vi.importActual<typeof import('../src/protocols/game-registry.js')>(
    '../src/protocols/game-registry.js',
  )
  const schema = actual.GAME_PROTOCOL_GROUPS.find((group) => group.builds.includes(98310))!.schema
  return {
    ...actual,
    findReplayGameProtocol: () => undefined,
    GAME_PROTOCOL_GROUPS: [
      { sourceBuild: 98310, builds: [98310], schema, fingerprint: 'a' },
      {
        sourceBuild: 98311,
        builds: [98311],
        schema: {
          ...schema,
          events: {
            ...schema.events,
            27: [schema.events[27][0], 'NNet.Game.SDifferentCommandEvent'],
            5: [schema.events[5][0], 'NNet.Game.SDifferentLoadingEvent'],
          },
        },
        fingerprint: 'b',
      },
    ],
  }
})
import { parseReplayGameEvents } from '../src/game-events.js'

it('rejects multiple complete decoders that disagree rather than choosing the first', () => {
  expect(() => parseReplayGameEvents(Buffer.from('00200b0000000000000000', 'hex'), 99999)).toThrow(
    'Ambiguous candidate game protocols',
  )
})

it('rejects disagreeing skipped known events even when both returned timelines would be empty', () => {
  expect(() => parseReplayGameEvents(Uint8Array.of(0x40, 0, 5), 99999)).toThrow(
    'Ambiguous candidate game protocols',
  )
})
