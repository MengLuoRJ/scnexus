import { expect, it, vi } from 'vitest'
vi.mock('../src/protocols/game-registry.js', async () => {
  const { default: schema } = await import('../src/protocols/game98310.js')
  return {
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
