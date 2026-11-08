import { beforeEach, expect, it, vi } from 'vitest'
import {
  buildReplaySpatialTimeline,
  parseReplayTrackerEvents,
  type ReplayTrackerEvents,
} from '@scnexus/replay-parser'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { openMpq } from '../../../utils/mpq'
import { analyzeLocalReplay, REPLAY_ANALYSIS_VERSION } from '../replay-analysis'

vi.mock('../../../utils/mpq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/mpq')>()),
  openMpq: vi.fn<typeof openMpq>(),
}))
vi.mock('@scnexus/replay-parser', async (importOriginal) => {
  const original = await importOriginal<typeof import('@scnexus/replay-parser')>()
  return {
    ...original,
    parseReplayTrackerEvents: vi.fn<typeof parseReplayTrackerEvents>(),
    buildReplaySpatialTimeline: vi.fn<typeof buildReplaySpatialTimeline>(
      original.buildReplaySpatialTimeline,
    ),
  }
})

const record = {
  id: 'spatial',
  path: 'spatial.SC2Replay',
  contentHash: 'hash',
  baseBuild: 98310,
  durationSeconds: null,
  players: [],
} as unknown as ReplayRecord
let tracker: ReplayTrackerEvents

beforeEach(() => {
  vi.clearAllMocks()
  tracker = {
    baseBuild: 98310,
    protocolVersion: 'tracker-versioned-v1',
    decoderStrategy: 'self-describing-versioned',
    algorithmVersion: 'test',
    skippedEvents: 0,
    unknownEventIds: [],
    warnings: [],
    events: [
      {
        eventId: 1,
        eventType: 'NNet.Replay.Tracker.SUnitBornEvent',
        gameLoop: 160,
        data: {
          m_unitTagIndex: 1,
          m_unitTagRecycle: 1,
          m_controlPlayerId: 1,
          m_upkeepPlayerId: 1,
          m_unitTypeName: { text: 'Marine', hex: '' },
          m_x: 10,
          m_y: 20,
        },
      },
    ],
  }
  vi.mocked(parseReplayTrackerEvents).mockImplementation(() => tracker)
  vi.mocked(openMpq).mockResolvedValue({
    hasFile: async (name: string) => name === 'replay.tracker.events',
    readFile: async () => new Uint8Array(),
    close: async () => {},
  } as unknown as Awaited<ReturnType<typeof openMpq>>)
})

it('versions and serializes observational spatial output with observed duration fallback', async () => {
  const result = await analyzeLocalReplay(record)
  expect(result.parserVersion).toBe(REPLAY_ANALYSIS_VERSION)
  expect(result.parserVersion).toContain('spatial-v1')
  expect(buildReplaySpatialTimeline).toHaveBeenCalledWith(tracker, undefined)
  expect(result.spatial).toMatchObject({ version: 1, durationGameLoops: 160, partial: false })
  expect(result.spatial?.units[0]?.observations[0]).toMatchObject({ x: 10, y: 20 })
  expect(JSON.parse(JSON.stringify(result)).spatial).toEqual(result.spatial)
})

it('converts verified header game-loop seconds, not wall-clock speed', async () => {
  const result = await analyzeLocalReplay({ ...record, durationSeconds: 20 })
  expect(buildReplaySpatialTimeline).toHaveBeenCalledWith(tracker, 320)
  expect(result.spatial?.durationGameLoops).toBe(320)
})

it('preserves parser partial output and diagnostics without discarding unrelated metrics', async () => {
  tracker.skippedEvents = 1
  const result = await analyzeLocalReplay(record)
  expect(result.spatial?.partial).toBe(true)
  expect(result.spatial?.diagnostics).toContainEqual({ code: 'incomplete-tracker', gameLoop: null })
  expect(result.spatial?.units).toHaveLength(1)
  expect(result.metrics).toBeDefined()
  expect(result.capabilities?.tracker.state).toBe('partial')
})

it('leaves spatial absent with an explicit missing tracker diagnostic', async () => {
  vi.mocked(openMpq).mockResolvedValue({
    hasFile: async () => false,
    close: async () => {},
  } as unknown as Awaited<ReturnType<typeof openMpq>>)
  const result = await analyzeLocalReplay(record)
  expect(result.spatial).toBeUndefined()
  expect(result.warnings).toContain('Missing replay.tracker.events')
  expect(buildReplaySpatialTimeline).not.toHaveBeenCalled()
  expect(result.metrics).toBeDefined()
})

it('isolates projection failures from tracker availability and other analyses', async () => {
  vi.mocked(buildReplaySpatialTimeline).mockImplementationOnce(() => {
    throw new RangeError('spatial budget failure')
  })
  const result = await analyzeLocalReplay(record)
  expect(result.spatial).toBeUndefined()
  expect(result.warnings).toContain('Spatial timeline unavailable: spatial budget failure')
  expect(result.capabilities?.tracker.state).toBe('available')
  expect(result.components.tracker).toBe(tracker)
  expect(result.metrics).toBeDefined()
  expect(result.insights).toBeDefined()
  expect(result.status).toBe('partial')
})

it('preserves bounded parser budget diagnostics and projected units verbatim', async () => {
  const bounded = {
    version: 1 as const,
    baseBuild: 98310,
    durationGameLoops: 160,
    partial: true,
    diagnostics: [{ code: 'budget-exceeded' as const, gameLoop: 160 }],
    units: [],
  }
  vi.mocked(buildReplaySpatialTimeline).mockReturnValueOnce(bounded)
  const result = await analyzeLocalReplay(record)
  expect(result.spatial).toBe(bounded)
  expect(result.metrics).toBeDefined()
  expect(result.capabilities?.tracker.state).toBe('available')
})
