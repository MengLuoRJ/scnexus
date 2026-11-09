import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { ReplayAnalysis, ReplayScope } from '@scnexus/app-shared/types/replay.type'
import type { ReplaySpatialObservation } from '@scnexus/replay-parser'
import * as observer from '@scnexus/sc2-observer'
import * as replayFiles from '../replay-files'
import * as observerRunner from '../replay-observer-runner'
import {
  replayAnalysisView,
  createReplayObserverWindowReader,
  replayObserverWindow,
  validateReplayObserverWindowRequest,
  REPLAY_OBSERVER_MAX_BYTES,
  REPLAY_OBSERVER_MAX_OBSERVATIONS,
} from '../replay-observer'

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' } }))
vi.mock('../../../stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('../../../utils/7zip-wrapper', () => ({ SevenZipWrapper: class {} }))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))
import { getApplicationDataDirectory } from '../../../utils/application-data'
import { replayDatabase } from '../replay-db'
import { REPLAY_ANALYSIS_VERSION } from '../replay-analysis'
import { ReplayLibraryService } from '../replay'

function observation(
  gameLoop: number,
  kind: ReplaySpatialObservation['kind'],
  overrides: Partial<ReplaySpatialObservation> = {},
): ReplaySpatialObservation {
  return {
    gameLoop,
    kind,
    unitType: 'Marine',
    controlPlayerId: 1,
    upkeepPlayerId: 1,
    x: 10,
    y: 20,
    positionGameLoop: gameLoop,
    completed: true,
    ...overrides,
  }
}
function analysis(): ReplayAnalysis {
  return {
    replayId: 'replay-1',
    contentHash: 'a'.repeat(64),
    parserVersion: REPLAY_ANALYSIS_VERSION,
    baseBuild: 98310,
    status: 'completed',
    analyzedAt: '2026-11-09T00:00:00Z',
    components: { initData: null, attributes: null, tracker: { raw: [1, 2] } },
    warnings: [],
    spatial: {
      version: 1,
      baseBuild: 98310,
      durationGameLoops: 4000,
      partial: false,
      diagnostics: [{ code: 'incomplete-tracker', gameLoop: null }],
      units: [
        {
          unitTag: '1-1',
          unitTagIndex: 1,
          unitTagRecycle: 1,
          startedGameLoop: 0,
          diedGameLoop: 1700,
          observations: [
            observation(0, 'init', { completed: false }),
            observation(20, 'position', { x: 30 }),
            observation(40, 'done'),
            observation(100, 'owner-change', { controlPlayerId: 2 }),
            observation(1500, 'type-change', { unitType: 'Marauder' }),
            observation(1650, 'position', { x: 50 }),
            observation(1700, 'died'),
          ],
        },
      ],
    },
  }
}
const request = (input = analysis(), gameLoop = 1600.5) => ({
  contentHash: input.contentHash,
  parserVersion: input.parserVersion,
  gameLoop,
})
let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  observerRunner.disposeReplayObserverWorkers()
  replayDatabase.close()
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

it('projects owned lifecycle history without positions or modifying cached analysis', () => {
  const input = analysis()
  const original = structuredClone(input)
  const view = replayAnalysisView(input)
  expect(view).not.toHaveProperty('spatial')
  expect(view).not.toHaveProperty('components')
  expect(input).toEqual(original)
})

it('excludes every raw component while retaining derived analysis and leaving stored data intact', () => {
  const input = analysis()
  input.components = {
    initData: { marker: 'raw-init' },
    attributes: { marker: 'raw-attributes' },
    tracker: Array.from({ length: 2048 }, () => 'raw-tracker'.repeat(100)),
    game: { marker: 'raw-game' },
    message: { marker: 'raw-message' },
  }
  input.commands = [{ gameLoop: 12, userId: 0, abilityLink: 1, abilityIndex: 2, flags: 0 }]
  input.warnings = ['derived warning']
  const before = JSON.stringify(input)
  const view = replayAnalysisView(input)
  const serialized = JSON.stringify(view)
  expect(view.commands).toEqual(input.commands)
  expect(view.warnings).toEqual(input.warnings)
  expect(view.status).toBe(input.status)
  for (const marker of ['raw-init', 'raw-attributes', 'raw-tracker', 'raw-game', 'raw-message'])
    expect(serialized).not.toContain(marker)
  expect(serialized.length).toBeLessThan(before.length / 100)
  expect(JSON.stringify(input)).toBe(before)
  const { spatial: _spatial, ...withoutSpatial } = input
  const missing = replayAnalysisView(withoutSpatial)
  expect(missing).not.toHaveProperty('components')
  expect(missing).not.toHaveProperty('observer')
  expect(missing.commands).toEqual(input.commands)
})

it('retains lifecycle metadata and owns every mutable history level', () => {
  const input = analysis()
  const original = structuredClone(input)
  const view = replayAnalysisView(input)
  const history = view.observer!.history
  expect(history).toEqual({
    ...input.spatial,
    units: input.spatial!.units.map((unit) => ({
      ...unit,
      observations: unit.observations
        .filter((item) => item.kind !== 'position')
        .map((item) => ({
          ...item,
          x: null,
          y: null,
          positionGameLoop: null,
        })),
    })),
  })
  expect(view.observer).toMatchObject({
    replayId: input.replayId,
    contentHash: input.contentHash,
    parserVersion: input.parserVersion,
  })
  history.diagnostics[0]!.gameLoop = 1
  history.units[0]!.observations[0]!.unitType = 'changed'
  history.units[0]!.unitTagIndex = 3
  history.units.push({ ...history.units[0]!, unitTag: 'new' })
  expect(input).toEqual(original)
  const { spatial: _spatial, ...withoutSpatial } = input
  expect(replayAnalysisView({ ...withoutSpatial, observer: view.observer })).not.toHaveProperty(
    'observer',
  )
})

it.each([
  null,
  [],
  {},
  { ...request(), contentHash: 'A'.repeat(64) },
  { ...request(), contentHash: 'a'.repeat(63) },
  { ...request(), parserVersion: '' },
  { ...request(), parserVersion: 'v'.repeat(513) },
  { ...request(), gameLoop: '1' },
  ...[-1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1].map((gameLoop) =>
    request(undefined, gameLoop),
  ),
])('rejects malformed observer requests: %j', (value) => {
  expect(() => validateReplayObserverWindowRequest(value)).toThrow(AppError)
  expect(() => validateReplayObserverWindowRequest(value)).toThrow(
    expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
  )
})

it('accepts fractional, zero and safe-bound loops and ignores unknown keys', () => {
  for (const gameLoop of [0, 1600.5, Number.MAX_SAFE_INTEGER])
    expect(() =>
      validateReplayObserverWindowRequest({ ...request(undefined, gameLoop), extra: true }),
    ).not.toThrow()
})

it('rejects missing spatial data, stale identities and loops beyond duration', async () => {
  const input = analysis()
  await expect(
    replayObserverWindow({ ...input, spatial: undefined }, request()),
  ).rejects.toMatchObject({ code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code })
  for (const stale of [
    { ...request(), contentHash: 'b'.repeat(64) },
    { ...request(), parserVersion: 'old' },
  ])
    await expect(replayObserverWindow(input, stale)).rejects.toMatchObject({
      code: ERRORS.REPLAY_OBSERVER_STALE.code,
    })
  await expect(replayObserverWindow(input, request(input, 4000.1))).rejects.toMatchObject({
    code: ERRORS.IPC_INVALID_ARGUMENT.code,
  })
})

it('matches cumulative full samples across boundaries, fractional loops and death', async () => {
  const input = analysis()
  for (const loop of [0, 19.5, 40, 1500, 1599.5, 1600, 1600.5, 1650, 1700, 3200, 4000]) {
    const window = await replayObserverWindow(input, request(input, loop))
    expect(window).toMatchObject({
      replayId: input.replayId,
      contentHash: input.contentHash,
      parserVersion: input.parserVersion,
    })
    expect(window.toGameLoop - window.fromGameLoop).toBeLessThanOrEqual(1600)
    expect(observer.sampleReplaySpatialTimeline(window.timeline, loop)).toEqual(
      observer.sampleReplaySpatialTimeline(input.spatial!, loop),
    )
  }
})

it('enforces the observation cap before serializing and disposes the source on failure', async () => {
  const input = analysis()
  const observations = Array.from({ length: REPLAY_OBSERVER_MAX_OBSERVATIONS + 1 }, () =>
    observation(1, 'position'),
  )
  input.spatial!.units[0]!.observations = observations
  const factory = observer.createReplayObserverTimelineSource
  const dispose = vi.fn<() => void>()
  vi.spyOn(observer, 'createReplayObserverTimelineSource').mockImplementation((...args) => {
    const source = factory(...args)
    return {
      ...source,
      dispose: () => {
        source.dispose()
        dispose()
      },
    }
  })
  const stringify = vi.spyOn(JSON, 'stringify')
  await expect(replayObserverWindow(input, request(input, 0))).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_LIMIT.code,
  })
  expect(stringify).not.toHaveBeenCalled()
  expect(dispose).toHaveBeenCalledOnce()
})

it('counts UTF-8 response bytes and rejects oversized windows without truncating', async () => {
  const input = analysis()
  input.spatial!.units[0]!.observations = [
    observation(0, 'born', { unitType: '界'.repeat(Math.ceil(REPLAY_OBSERVER_MAX_BYTES / 3)) }),
  ]
  await expect(replayObserverWindow(input, request(input, 0))).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_LIMIT.code,
  })
  input.spatial!.units[0]!.observations = [observation(0, 'born')]
  expect(
    (await replayObserverWindow(input, request(input, 0))).timeline.units[0]!.observations,
  ).toHaveLength(1)
})

async function setupStoredAnalysis() {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-observer-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  const scope: ReplayScope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }
  const root = join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category)
  await mkdir(root, { recursive: true })
  await mkdir(join(directory, 'Accounts', '1', '2-S2-1-456'), { recursive: true })
  const file = join(root, 'sample.SC2Replay')
  await writeFile(file, 'candidate')
  const service = new ReplayLibraryService(() => directory!)
  const record = (await service.scan(scope))[0]!
  const input = { ...analysis(), replayId: record.id, contentHash: record.contentHash! }
  await replayDatabase.saveAnalysis(input)
  return { scope, root, file, service, record, input }
}

it('revalidates scope, path, content, parser version and replay identity on every service request', async () => {
  const { scope, root, file, service, record, input } = await setupStoredAnalysis()
  const first = await service.getObserverWindow(scope, record.id, request(input))
  expect(first.replayId).toBe(record.id)
  await writeFile(join(root, 'duplicate.SC2Replay'), 'candidate')
  const duplicate = (await service.scan(scope)).find((item) => item.id !== record.id)!
  expect(duplicate.contentHash).toBe(input.contentHash)
  await expect(
    service.getObserverWindow(scope, duplicate.id, request(input)),
  ).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code,
  })
  await replayDatabase.saveAnalysis({ ...input, replayId: duplicate.id })
  expect((await service.getObserverWindow(scope, duplicate.id, request(input))).replayId).toBe(
    duplicate.id,
  )
  expect((await service.getObserverWindow(scope, record.id, request(input))).replayId).toBe(
    record.id,
  )
  for (const invalid of [
    { ...scope, category: 'Campaign' as const },
    { ...scope, profileHandle: '2-S2-1-456' },
  ])
    await expect(service.getObserverWindow(invalid, record.id, request(input))).rejects.toThrow(
      'not indexed',
    )
  await expect(service.getObserverWindow(scope, 'unknown', request(input))).rejects.toThrow(
    'not indexed',
  )
  await replayDatabase.upsertReplay({
    ...record,
    id: 'outside',
    path: join(directory, 'outside.SC2Replay'),
  })
  await expect(service.getObserverWindow(scope, 'outside', request(input))).rejects.toThrow(
    'not indexed',
  )
  await replayDatabase.saveAnalysis({ ...input, parserVersion: 'old' })
  await expect(service.getObserverWindow(scope, record.id, request(input))).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code,
  })
  await replayDatabase.saveAnalysis(input)
  await writeFile(file, 'changed')
  await expect(service.getObserverWindow(scope, record.id, request(input))).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code,
  })
  await writeFile(file, 'candidate')
  expect((await service.getObserverWindow(scope, record.id, request(input))).replayId).toBe(
    record.id,
  )
  const reads = vi.spyOn(service, 'getAnalysis')
  await expect(
    service.getObserverWindow(scope, record.id, request(input, NaN)),
  ).rejects.toMatchObject({ code: ERRORS.IPC_INVALID_ARGUMENT.code })
  expect(reads).not.toHaveBeenCalled()
})

it('reuses a single prepared timeline and reloads same-identity analysis after every save', async () => {
  const { scope, service, record, input } = await setupStoredAnalysis()
  const reads = vi.spyOn(replayDatabase, 'getAnalysis')
  const sources = vi.spyOn(observerRunner, 'createReplayObserverWorkerReader')
  const token = await replayDatabase.getAnalysisToken(record.id)
  await service.getObserverWindow(scope, record.id, request(input, 0))
  await service.getObserverWindow(scope, record.id, request(input, 1700))
  expect(reads).toHaveBeenCalledTimes(1)
  expect(sources).toHaveBeenCalledTimes(1)
  const updated = structuredClone(input)
  updated.spatial!.units[0]!.observations[0]!.x = 999
  await replayDatabase.saveAnalysis(updated)
  expect(await replayDatabase.getAnalysisToken(record.id)).not.toBe(token)
  const window = await service.getObserverWindow(scope, record.id, request(input, 0))
  expect(window.timeline.units[0]!.observations[0]!.x).toBe(999)
  expect(reads).toHaveBeenCalledTimes(2)
  expect(sources).toHaveBeenCalledTimes(2)
  await replayDatabase.deleteReplayByPath(record.path)
  expect(await replayDatabase.getAnalysisToken(record.id)).toBeNull()
  await expect(service.getObserverWindow(scope, record.id, request(input, 0))).rejects.toThrow(
    'not indexed',
  )
})

it('recreates an exited worker instead of reusing a failed cached reader', async () => {
  const { scope, service, record, input } = await setupStoredAnalysis()
  const sources = vi.spyOn(observerRunner, 'createReplayObserverWorkerReader')
  await service.getObserverWindow(scope, record.id, request(input, 0))
  observerRunner.disposeReplayObserverWorkers()
  const next = await service.getObserverWindow(scope, record.id, request(input, 1700))
  expect(next.replayId).toBe(record.id)
  expect(sources).toHaveBeenCalledTimes(2)
})

it('rechecks the analysis token after file hashing before reusing a cached source', async () => {
  const { scope, service, record, input } = await setupStoredAnalysis()
  await service.getObserverWindow(scope, record.id, request(input, 0))
  const updated = structuredClone(input)
  updated.spatial!.units[0]!.observations[0]!.x = 999
  const hashFile = replayFiles.hashReplayFile
  vi.spyOn(replayFiles, 'hashReplayFile').mockImplementationOnce(async (path) => {
    await replayDatabase.saveAnalysis(updated)
    return hashFile(path)
  })
  const window = await service.getObserverWindow(scope, record.id, request(input, 0))
  expect(window.timeline.units[0]!.observations[0]!.x).toBe(999)
})

it('evicts the previous replay source and rebuilds it when revisited', async () => {
  const { scope, root, service, record, input } = await setupStoredAnalysis()
  await writeFile(join(root, 'duplicate.SC2Replay'), 'candidate')
  const duplicate = (await service.scan(scope)).find((item) => item.id !== record.id)!
  await replayDatabase.saveAnalysis({ ...input, replayId: duplicate.id })
  const sources = vi.spyOn(observerRunner, 'createReplayObserverWorkerReader')
  await service.getObserverWindow(scope, record.id, request(input, 0))
  await service.getObserverWindow(scope, duplicate.id, request(input, 0))
  await service.getObserverWindow(scope, record.id, request(input, 0))
  expect(sources).toHaveBeenCalledTimes(3)
})

it('does not cache analysis replaced while a cache miss is being loaded', async () => {
  const { scope, service, record, input } = await setupStoredAnalysis()
  const getAnalysis = replayDatabase.getAnalysis.bind(replayDatabase)
  vi.spyOn(replayDatabase, 'getAnalysis').mockImplementationOnce(async (id) => {
    const previous = await getAnalysis(id)
    await replayDatabase.saveAnalysis(input)
    return previous
  })
  const sources = vi.spyOn(observerRunner, 'createReplayObserverWorkerReader')
  await expect(
    service.getObserverWindow(scope, record.id, request(input, 0)),
  ).rejects.toMatchObject({ code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code })
  expect(sources).not.toHaveBeenCalled()
  await service.getObserverWindow(scope, record.id, request(input, 0))
  expect(sources).toHaveBeenCalledOnce()
})

it('allows in-flight windows to finish during eviction and then releases the retired source', async () => {
  const input = analysis()
  const factory = observer.createReplayObserverTimelineSource
  const dispose = vi.fn<() => void>()
  vi.spyOn(observer, 'createReplayObserverTimelineSource').mockImplementation((...args) => {
    const source = factory(...args)
    return {
      ...source,
      dispose: () => {
        source.dispose()
        dispose()
      },
    }
  })
  const reader = createReplayObserverWindowReader(input)
  const first = reader.loadWindow(request(input, 0))
  const second = reader.loadWindow(request(input, 1700))
  reader.dispose()
  reader.dispose()
  expect(dispose).not.toHaveBeenCalled()
  const windows = await Promise.all([first, second])
  expect(windows.map((window) => window.fromGameLoop)).toEqual([0, 1600])
  expect(dispose).toHaveBeenCalledOnce()
  await expect(reader.loadWindow(request(input, 0))).rejects.toMatchObject({
    code: ERRORS.REPLAY_OBSERVER_UNAVAILABLE.code,
  })
})
