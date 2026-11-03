import { describe, expect, it } from 'vitest'
import {
  parseReplayGameEvents,
  SUPPORTED_REPLAY_GAME_BASE_BUILDS,
  UnsupportedReplayBuildError,
} from '../src/index.js'

// Delta 0, user 0, event 27; zero flags, absent optionals, None target,
// and sequence's encoded zero (wire minimum 1), padded to the next byte.
const minimalCommand = Uint8Array.from([0, 0x20, 0x0b, 0, 0, 0, 0, 0, 0, 0, 0])
// Delta 16, user 0, event 40 (SUserFinishedLoadingSyncEvent), with no body.
const loadingTail = [0x40, 0, 5]

describe('bounded bit-packed game events', () => {
  it('decodes a standalone minimal SCmdEvent usable by archive/worker integration tests', () => {
    const result = parseReplayGameEvents(minimalCommand, 98310)
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
  it('preserves elapsed loops after the final action for APM denominators', () => {
    // Command at loop 0 followed by a non-retained loading event at loop 16.
    const result = parseReplayGameEvents(
      Uint8Array.from([...minimalCommand, ...loadingTail]),
      98310,
    )
    expect(result.events).toHaveLength(1)
    expect(result.events[0]!.gameLoop).toBe(0)
    expect(result.elapsedGameLoops).toBe(16)
    expect(result.skippedEvents).toBe(1)
    expect(parseReplayGameEvents(new Uint8Array(), 98310).elapsedGameLoops).toBe(0)
  })
  it.each([0, -1, 1.5, NaN])('rejects invalid baseBuild %s', (build) => {
    expect(() => parseReplayGameEvents(new Uint8Array(), build)).toThrow(
      UnsupportedReplayBuildError,
    )
  })

  it('supports official build 62848 again without a retired-build exception', () => {
    expect(SUPPORTED_REPLAY_GAME_BASE_BUILDS).toContain(62848)
    expect(parseReplayGameEvents(new Uint8Array(), 62848).compatibility.state).toBe('verified')
  })

  it('tries unknown builds without promoting them to verified compatibility', () => {
    const result = parseReplayGameEvents(minimalCommand, 1000000)
    expect(result.compatibility.state).toBe('unverified')
    expect(result.events).toEqual(parseReplayGameEvents(minimalCommand, 98310).events)
    expect(result.compatibility.candidateBuilds.length).toBeLessThanOrEqual(3)
    expect(() =>
      parseReplayGameEvents(minimalCommand, 1000000, { allowUnverified: false }),
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
    const bytes = minimalCommand
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
    const bytes = Uint8Array.from([...minimalCommand, ...loadingTail])
    expect(() => parseReplayGameEvents(bytes, 98310, { maxEvents: 1 })).toThrow('event limit')
    expect(parseReplayGameEvents(bytes, 98310, { maxEvents: 2 })).toMatchObject({
      processedEvents: 2,
      skippedEvents: 1,
      events: [expect.objectContaining({ eventId: 27 })],
    })
    for (const maxEvents of [0, -1, 100001, 1.5, NaN]) {
      expect(() => parseReplayGameEvents(bytes, 98310, { maxEvents })).toThrow(RangeError)
    }
    expect(() => parseReplayGameEvents(new Uint8Array(32 * 1024 * 1024 + 1), 98310)).toThrow(
      'byte limit',
    )
  })
})
