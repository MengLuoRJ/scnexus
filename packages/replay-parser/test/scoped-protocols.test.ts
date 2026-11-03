import { describe, expect, it } from 'vitest'
import { parseReplayGameEvents } from '../src/index.js'
import {
  replayGameProtocol,
  replayInitDataProtocolBuild,
  replayProtocol,
} from '../src/protocol-schema.js'
import {
  INIT_PROTOCOL_GROUPS,
  GAME_PROTOCOL_GROUPS,
  findReplayProtocolCandidates,
} from '../src/protocols/game-registry.js'
import type { GameProtocolSchema } from '../src/protocol-schema.js'

function structure(schema: GameProtocolSchema, id: number): unknown {
  const [kind, args] = schema.types[id]!
  switch (kind) {
    case '_optional':
      return [kind, structure(schema, args[0])]
    case '_array':
      return [kind, args[0], structure(schema, args[1])]
    case '_struct':
      return [kind, args[0].map(([name, child, tag]) => [name, structure(schema, child), tag])]
    case '_choice':
      return [
        kind,
        args[0],
        Object.entries(args[1]).map(([tag, [name, child]]) => [
          tag,
          name,
          structure(schema, child),
        ]),
      ]
    default:
      return [kind, args]
  }
}

function gameStructure(schema: GameProtocolSchema): unknown {
  return [
    structure(schema, schema.delta),
    schema.userId === undefined ? null : structure(schema, schema.userId),
    structure(schema, schema.eventId),
    Object.entries(schema.events).map(([id, [type, name]]) => [id, name, structure(schema, type)]),
  ]
}

describe('official build membership and bounded trials', () => {
  it.each([95841, 96163, 96314, 96516])(
    'does not promote independently observed non-official build %i to verified',
    (build) => {
      expect(() => replayInitDataProtocolBuild(build)).toThrow('Unsupported replay base build')
      expect(() => replayProtocol(build)).toThrow('Unsupported replay base build')
      expect(() => replayGameProtocol(build)).toThrow('Unsupported replay base build')
      expect(() => parseReplayGameEvents(new Uint8Array(), build)).toThrow('Empty game stream')
    },
  )

  it('deduplicates complete reachable game structures, not merely command layouts', () => {
    const structures = GAME_PROTOCOL_GROUPS.map((group) =>
      JSON.stringify(gameStructure(group.schema)),
    )
    expect(new Set(structures).size).toBe(GAME_PROTOCOL_GROUPS.length)
    for (const group of GAME_PROTOCOL_GROUPS) {
      for (const build of group.builds) expect(replayGameProtocol(build)).toBe(group.schema)
    }
  })

  it('tries only the three nearest distinct structures by actual member distance', () => {
    const candidates = findReplayProtocolCandidates(95841, INIT_PROTOCOL_GROUPS)
    const distance = (builds: readonly number[]) =>
      Math.min(...builds.map((build) => Math.abs(build - 95841)))
    expect(candidates).toHaveLength(3)
    expect(new Set(candidates.map((group) => group.fingerprint)).size).toBe(3)
    expect(candidates.map((group) => distance(group.builds))).toEqual(
      INIT_PROTOCOL_GROUPS.map((group) => distance(group.builds))
        .sort((a, b) => a - b)
        .slice(0, 3),
    )
  })

  it.each([62847, 62849, 95840, 95842, 96162, 96164, 96313, 96315, 96515, 96517])(
    'does not expand official membership into numeric ranges (%i)',
    (build) => {
      expect(() => replayProtocol(build)).toThrow('Unsupported replay base build')
      expect(() => replayGameProtocol(build)).toThrow('Unsupported replay base build')
    },
  )
})
