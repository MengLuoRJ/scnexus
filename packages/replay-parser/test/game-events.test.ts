import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseReplayGameEvents,
  SUPPORTED_REPLAY_GAME_BASE_BUILDS,
  UnsupportedReplayBuildError,
} from '../src/index.js'
import { replayGameProtocol } from '../src/protocol-schema.js'

function fixture(build: number): Uint8Array {
  return readFileSync(new URL(`./fixtures/game${build}.bin`, import.meta.url))
}

describe('bounded bit-packed game events', () => {
  it('decodes a standalone minimal SCmdEvent usable by archive/worker integration tests', () => {
    const result = parseReplayGameEvents(Buffer.from('00200b0000000000000000', 'hex'), 98310)
    expect(result).toMatchObject({
      processedEvents: 1,
      skippedEvents: 0,
      events: [
        {
          eventId: 27,
          eventType: 'NNet.Game.SCmdEvent',
          gameLoop: 0,
          userId: 0,
          data: {
            m_cmdFlags: 0,
            m_abil: null,
            m_data: { None: null },
            m_sequence: 1,
            m_otherUnit: null,
            m_unitGroup: null,
          },
        },
      ],
    })
  })
  it.each([70154, 98310])(
    'matches pinned official Python decoder for every known event and rich commands, build %i',
    (build) => {
      const expected = JSON.parse(
        readFileSync(new URL(`./fixtures/game${build}.json`, import.meta.url), 'utf8'),
      )
      const result = parseReplayGameEvents(fixture(build), build)
      expect(result).toMatchObject({ ...expected, protocolVersion: result.protocolVersion })
      expect(result.compatibility.state).toBe('verified')
      expect(result.events).toEqual(expected.events)
      expect(result.processedEvents).toBe(Object.keys(replayGameProtocol(build).events).length + 6)
      expect(result.events.filter((e) => e.eventId === 27)).toHaveLength(5)
      const command = result.events.filter((e) => e.eventId === 27)[2]!
      expect(command).toMatchObject({
        userId: 2,
        gameLoop: 215,
        data: {
          m_cmdFlags: 0x123456,
          m_abil: { m_abilLink: 345, m_abilCmdIndex: 7, m_abilCmdData: 128 },
          m_data: { TargetPoint: { x: 1234, y: 5678, z: -4096 } },
          m_otherUnit: 0xf1234567,
        },
      })
      expect(() => JSON.stringify(result)).not.toThrow()
    },
  )

  it.each([0, -1, 1.5, NaN])('rejects invalid baseBuild %s', (build) => {
    expect(() => parseReplayGameEvents(new Uint8Array(), build)).toThrow(
      UnsupportedReplayBuildError,
    )
  })

  it('tries unknown builds without promoting them to verified compatibility', () => {
    const result = parseReplayGameEvents(fixture(98310), 1000000)
    expect(result.compatibility.state).toBe('unverified')
    expect(result.events).toEqual(parseReplayGameEvents(fixture(98310), 98310).events)
    expect(result.compatibility.candidateBuilds.length).toBeLessThanOrEqual(3)
    expect(() =>
      parseReplayGameEvents(fixture(98310), 1000000, { allowUnverified: false }),
    ).toThrow(UnsupportedReplayBuildError)
    expect(() => parseReplayGameEvents(new Uint8Array(), 1000000)).toThrow('Empty game stream')
    expect(() => parseReplayGameEvents(new Uint8Array([0]), 1000000)).toThrow(
      'No candidate game protocol',
    )
  })

  it('registers more than the original two official builds', () => {
    expect(SUPPORTED_REPLAY_GAME_BASE_BUILDS.length).toBeGreaterThan(2)
    for (const build of SUPPORTED_REPLAY_GAME_BASE_BUILDS) {
      const result = parseReplayGameEvents(new Uint8Array(), build, { allowUnverified: false })
      expect(result.baseBuild).toBe(build)
      expect(result.compatibility.state).toBe('verified')
      expect(result.processedEvents).toBe(0)
    }
  })

  it('reports genuinely empty streams but never conceals malformed/truncated bytes', () => {
    expect(parseReplayGameEvents(new Uint8Array(), 98310)).toMatchObject({
      events: [],
      processedEvents: 0,
      skippedEvents: 0,
    })
    const bytes = fixture(98310)
    expect(() => parseReplayGameEvents(bytes.subarray(0, -1), 98310)).toThrow(/Truncated|invalid/)
    expect(() => parseReplayGameEvents(new Uint8Array([0]), 98310)).toThrow(/Truncated/)
    expect(() => parseReplayGameEvents(Uint8Array.from([...bytes, 0]), 98310)).toThrow(/Truncated/)
  })

  it('aborts unknown ids rather than guessing a boundary or returning partial success', () => {
    // Eight-bit delta(0), then five user-id bits and seven id bits, low-bit byte chunks.
    expect(() => parseReplayGameEvents(new Uint8Array([0, 0xe0, 0x0f]), 98310)).toThrow(
      'Unknown game event id 127; boundary unavailable',
    )
  })

  it('counts skipped events in the event limit and bounds input/options', () => {
    const bytes = fixture(98310)
    expect(() => parseReplayGameEvents(bytes, 98310, { maxEvents: 107 })).toThrow('event limit')
    expect(parseReplayGameEvents(bytes, 98310, { maxEvents: 108 }).processedEvents).toBe(108)
    for (const maxEvents of [0, -1, 100001, 1.5, NaN]) {
      expect(() => parseReplayGameEvents(bytes, 98310, { maxEvents })).toThrow(RangeError)
    }
    expect(() => parseReplayGameEvents(new Uint8Array(32 * 1024 * 1024 + 1), 98310)).toThrow(
      'byte limit',
    )
  })
})
