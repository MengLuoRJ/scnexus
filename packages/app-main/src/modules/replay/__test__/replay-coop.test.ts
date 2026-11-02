import { afterEach, expect, it, vi } from 'vitest'
import type { ReplayRecord } from '@scnexus/app-shared/types/replay.type'
import { openMpq } from '../../../utils/mpq'
import { analyzeLocalReplay, REPLAY_ANALYSIS_VERSION } from '../replay-analysis'

vi.mock('../../../utils/mpq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/mpq')>()),
  openMpq: vi.fn<typeof openMpq>(),
}))
vi.mock('@scnexus/replay-parser', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@scnexus/replay-parser')>()),
  parseReplayInitData: vi.fn<() => import('@scnexus/replay-parser').ReplayInitData>(() => ({
    baseBuild: 98310,
    protocolVersion: 's2protocol-98310',
    algorithmVersion: 'test',
    data: {
      m_syncLobbyState: {
        m_gameDescription: { m_isCoopMode: true },
        m_lobbyState: { m_slots: [] },
      },
    },
  })),
  parseReplayTrackerEvents: vi.fn<() => import('@scnexus/replay-parser').ReplayTrackerEvents>(
    () => ({
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
            m_unitTypeName: { text: 'Marine', hex: '' },
          },
        },
      ],
    }),
  ),
}))
afterEach(() => vi.clearAllMocks())

it('assembles co-op after initData and tracker decode and serializes the additive DTO', async () => {
  const close = vi.fn<() => Promise<void>>(async () => {})
  vi.mocked(openMpq).mockResolvedValue({
    hasFile: async (name: string) => ['replay.initData', 'replay.tracker.events'].includes(name),
    readFile: async () => new Uint8Array(),
    close,
  } as unknown as Awaited<ReturnType<typeof openMpq>>)
  const result = await analyzeLocalReplay({
    id: 'coop',
    path: 'coop.SC2Replay',
    contentHash: 'hash',
    baseBuild: 98310,
    players: [],
  } as unknown as ReplayRecord)
  expect(result.parserVersion).toBe(REPLAY_ANALYSIS_VERSION)
  expect(result.parserVersion).toContain('coop-v2')
  expect(result.coop?.identification).toBe('confirmed')
  expect(result.coop?.units.counts[0]).toMatchObject({ unitType: 'Marine', born: 1, completed: 1 })
  expect(result.coop?.timing.observedSeconds).toBe(10)
  expect(result.coop?.mutators.state).toBe('unknown')
  expect(JSON.parse(JSON.stringify(result)).coop).toEqual(result.coop)
  expect(close).toHaveBeenCalledOnce()
})

it('does not promote tracker-only evidence into confirmed co-op', async () => {
  vi.mocked(openMpq).mockResolvedValue({
    hasFile: async (name: string) => name === 'replay.tracker.events',
    readFile: async () => new Uint8Array(),
    close: async () => {},
  } as unknown as Awaited<ReturnType<typeof openMpq>>)
  const result = await analyzeLocalReplay({
    id: 'unknown',
    path: 'unknown.SC2Replay',
    contentHash: 'hash',
    baseBuild: 98310,
    players: [],
  } as unknown as ReplayRecord)
  expect(result.coop?.identification).toBe('unknown')
  expect(result.coop?.units.state).toBe('unknown')
})
