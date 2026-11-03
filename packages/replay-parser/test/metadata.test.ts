import { describe, expect, it } from 'vitest'
import {
  decodeVersioned,
  inspectReplayFile,
  parseReplayDetails,
  parseReplayHeader,
} from '../src/index.js'

function vint(value: number | bigint): number[] {
  let magnitude = BigInt(value)
  const negative = magnitude < 0n
  if (negative) magnitude = -magnitude
  const result = [Number(magnitude & 63n) * 2 + Number(negative)]
  magnitude >>= 6n
  while (magnitude) {
    result[result.length - 1]! |= 128
    result.push(Number(magnitude & 127n))
    magnitude >>= 7n
  }
  return result
}
function integer(value: number): number[] {
  return [9, ...vint(value)]
}
function text(value: string): number[] {
  const bytes = new TextEncoder().encode(value)
  return [2, ...vint(bytes.length), ...bytes]
}
function optional(value: number[]): number[] {
  return [4, 1, ...value]
}
function struct(fields: Record<number, number[]>): number[] {
  return [
    5,
    ...vint(Object.keys(fields).length),
    ...Object.entries(fields).flatMap(([key, value]) => [...vint(Number(key)), ...value]),
  ]
}
const header = Uint8Array.from(
  struct({
    0: text('StarCraft II replay\x1b11'),
    1: struct({
      1: integer(5),
      2: integer(0),
      3: integer(15),
      4: integer(98310),
      5: integer(98310),
    }),
    3: integer(1600),
  }),
)
const details = Uint8Array.from(
  struct({
    0: optional([
      0,
      ...vint(3),
      ...struct({
        0: text('玩家'),
        2: text('Terran'),
        5: integer(0),
        7: integer(0),
        8: integer(1),
      }),
      ...struct({
        0: text('Opponent'),
        2: text('Zerg'),
        5: integer(1),
        7: integer(0),
        8: integer(2),
      }),
      ...struct({ 0: text('Observer'), 7: integer(1) }),
    ]),
    1: text('测试地图'),
    99: [4, 0],
  }),
)

describe('self-describing replay metadata', () => {
  it('reads version, base build and game-loop duration from header bytes', () => {
    expect(parseReplayHeader(header)).toEqual({
      gameVersion: '5.0.15.98310',
      baseBuild: 98310,
      elapsedGameLoops: 1600,
      durationSeconds: 100,
    })
  })
  it('reads map, players, race, team and outcome, excluding observers', () => {
    expect(parseReplayDetails(details)).toEqual({
      mapName: '测试地图',
      playedAt: null,
      players: [
        { slot: 1, profileHandle: null, name: '玩家', race: 'Terran', team: 1, result: 'win' },
        { slot: 2, profileHandle: null, name: 'Opponent', race: 'Zerg', team: 2, result: 'loss' },
      ],
    })
  })
  it('reports actual supplied components but never claims event compatibility', async () => {
    const result = await inspectReplayFile('test.SC2Replay', {
      header,
      components: { 'replay.details': details },
      availableComponents: ['replay.game.events'],
    })
    expect(result.status).toBe('partial')
    expect(result.supportLevel).toBe('metadata-only')
    expect(result.summary.mapName).toBe('测试地图')
    expect(
      result.components.filter((component) => component.found).map((component) => component.name),
    ).toEqual(['replay.details', 'replay.game.events'])
  })
  it('keeps header metadata if details is corrupt', async () => {
    const result = await inspectReplayFile('test.SC2Replay', {
      header,
      components: { 'replay.details': details.subarray(0, 4) },
    })
    expect(result.status).toBe('corrupt')
    expect(result.summary.baseBuild).toBe(98310)
    expect(result.summary.mapName).toBeNull()
  })
  it('reads real UTC FILETIME without applying local offset twice', async () => {
    const timestamp = '2026-10-31T10:33:35.123Z'
    const ticks = BigInt(Date.parse(timestamp)) * 10000n + 116444736000000000n
    const bytes = Uint8Array.from(
      struct({
        0: optional([0, 0]),
        1: text('Map'),
        5: [9, ...vint(ticks)],
        6: [9, ...vint(8n * 3600n * 10000000n)],
      }),
    )
    expect(parseReplayDetails(bytes).playedAt).toBe(timestamp)
    expect(
      (await inspectReplayFile('date.SC2Replay', { components: { 'replay.details': bytes } }))
        .summary.playedAt,
    ).toBe(timestamp)
  })
  it.each([0n, -1n])('leaves invalid game timestamps unknown (%s)', (ticks) => {
    const bytes = Uint8Array.from(
      struct({ 0: optional([0, 0]), 1: text('Map'), 5: [9, ...vint(ticks)] }),
    )
    expect(parseReplayDetails(bytes).playedAt).toBeNull()
  })
  it('rejects timestamp integers exceeding the wire range', () => {
    const bytes = Uint8Array.from(
      struct({ 0: optional([0, 0]), 1: text('Map'), 5: [9, ...vint(999999999999999999999n)] }),
    )
    expect(() => parseReplayDetails(bytes)).toThrow('64-bit range')
  })
  it('extracts exact Battle.net profile handle and excludes computer identities', () => {
    const toon = struct({ 0: integer(5), 1: [7, 0, 0, 83, 50], 2: integer(1), 4: integer(2206060) })
    const bytes = Uint8Array.from(
      struct({
        0: optional([
          0,
          4,
          ...struct({ 1: toon }),
          ...struct({ 1: struct({ 0: integer(0), 2: integer(0), 4: integer(0) }) }),
        ]),
        1: text('Map'),
      }),
    )
    expect(parseReplayDetails(bytes).players.map((player) => player.profileHandle)).toEqual([
      '5-S2-1-2206060',
      null,
    ])
  })
  it('does not infer a draw from an undecided result', () => {
    const undecided = Uint8Array.from(
      struct({ 0: optional([0, 2, ...struct({ 8: integer(0) })]), 1: text('Map') }),
    )
    expect(parseReplayDetails(undecided).players[0]?.result).toBeNull()
  })
  it('preserves large signed integers without Number precision loss', () => {
    expect(decodeVersioned(Uint8Array.from([9, ...vint(-9223372036854775807n)]))).toBe(
      -9223372036854775807n,
    )
  })
  it.each([Uint8Array.of(255), Uint8Array.of(2, 20, 1), Uint8Array.of(0, 3)])(
    'rejects unknown, truncated and negative-length data (%j)',
    (data) => {
      expect(() => decodeVersioned(data)).toThrow(/wire type|Truncated|collection length/)
    },
  )
  it('bounds recursive input', () => {
    expect(() =>
      decodeVersioned(Uint8Array.from([...Array.from({ length: 70 }, () => [4, 1]).flat(), 6, 0])),
    ).toThrow('limit exceeded')
  })
  it('rejects non-SC2 signatures', () => {
    expect(() => parseReplayHeader(Uint8Array.from(struct({ 0: text('not SC2') })))).toThrow(
      'signature',
    )
  })
})
