import type { ReplayScope } from '@scnexus/app-shared/types/replay.type'
const scope: ReplayScope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }
vi.mock('../../../stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' } }))
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../utils/7zip-wrapper', () => ({ SevenZipWrapper: class {} }))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))
import { getApplicationDataDirectory } from '../../../utils/application-data'
import { createMpq } from '../../../utils/mpq'
import { replayDatabase } from '../replay-db'
import { REPLAY_ANALYSIS_VERSION } from '../replay-analysis'
import { ReplayLibraryService } from '../replay'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-analysis-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  await mkdir(join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category), {
    recursive: true,
  })
})
afterEach(async () => {
  replayDatabase.close()
  await rm(directory, { recursive: true, force: true })
})

it('runs bounded component decoding in a worker, persists and invalidates by content', async () => {
  const path = join(
    directory,
    'Accounts',
    '1',
    scope.profileHandle,
    'Replays',
    scope.category,
    'minimal.SC2Replay',
  )
  const archive = await createMpq(path)
  const attributes = Buffer.alloc(9)
  await archive.add(attributes, { archivePath: 'replay.attributes.events' })
  await archive.save()
  await archive.close()
  const service = new ReplayLibraryService(() => directory)
  const record = (await service.scan(scope))[0]!
  const [a, b] = await Promise.all([
    service.analyzeReplay(scope, record.id),
    service.analyzeReplay(scope, record.id),
  ])
  expect(a).toEqual(b)
  expect(a.status).toBe('partial')
  expect(a.insights).toBeUndefined()
  expect(a.components.attributes).toMatchObject({
    attributes: [],
    protocolVersion: 'attributes-v1',
  })
  expect(a.warnings).toContain('Missing replay.initData')
  replayDatabase.close()
  expect(await service.getAnalysis(scope, record.id)).toEqual(a)
  expect(a.parserVersion).toBe(REPLAY_ANALYSIS_VERSION)
  await replayDatabase.saveAnalysis({ ...a, parserVersion: 'components-1.0.0' })
  expect(await service.getAnalysis(scope, record.id)).toBeNull()
  await replayDatabase.saveAnalysis(a)
  await writeFile(path, 'changed')
  expect(await service.getAnalysis(scope, record.id)).toBeNull()
  await expect(service.analyzeReplay(scope, record.id)).rejects.toThrow('reindex before analysis')
  await service.scan(scope)
  expect(await service.getAnalysis(scope, record.id)).toBeNull()
})

it('keeps build-independent attributes but never falls back for unknown protocol builds', async () => {
  const path = join(
    directory,
    'Accounts',
    '1',
    scope.profileHandle,
    'Replays',
    scope.category,
    'unknown.SC2Replay',
  )
  const archive = await createMpq(path)
  await archive.add(Buffer.alloc(9), { archivePath: 'replay.attributes.events' })
  await archive.add(Buffer.from([0]), { archivePath: 'replay.initData' })
  await archive.add(Buffer.from([0]), { archivePath: 'replay.tracker.events' })
  await archive.save()
  await archive.close()
  const service = new ReplayLibraryService(() => directory)
  const record = (await service.scan(scope))[0]!
  await replayDatabase.upsertReplay({ ...record, baseBuild: 99999 })
  const analysis = await service.analyzeReplay(scope, record.id)
  expect(analysis.status).toBe('partial')
  expect(analysis.components.initData).toBeNull()
  expect(analysis.components.tracker).toBeNull()
  expect(analysis.components.attributes).not.toBeNull()
  expect(
    analysis.warnings.filter((message) => message.includes('Unsupported replay base build: 99999')),
  ).toHaveLength(2)
  expect(await service.getAnalysis(scope, record.id)).toEqual(analysis)
})

it.each([
  { event: [3, 0, 9, 0, 9, 30, 5, 0], status: 'partial', warning: 'Unknown tracker event id: 15' },
  { event: [3, 0, 9, 0, 9, 18, 5], status: 'corrupt', warning: 'Truncated' },
])(
  'classifies unsupported tracker schema separately from malformed bytes: $status',
  async ({ event, status, warning }) => {
    const path = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
      'schema.SC2Replay',
    )
    const archive = await createMpq(path)
    await archive.add(Buffer.alloc(9), { archivePath: 'replay.attributes.events' })
    await archive.add(Buffer.from(event), { archivePath: 'replay.tracker.events' })
    await archive.save()
    await archive.close()
    const service = new ReplayLibraryService(() => directory)
    const record = (await service.scan(scope))[0]!
    await replayDatabase.upsertReplay({ ...record, baseBuild: 98310 })
    const analysis = await service.analyzeReplay(scope, record.id)
    expect(analysis.status).toBe(status)
    expect(analysis.warnings.some((message) => message.includes(warning))).toBe(true)
    expect(analysis.components.tracker).toBeNull()
    expect(analysis.insights).toBeUndefined()
  },
)

it('rejects analysis of unindexed files without creating arbitrary tasks', async () => {
  await mkdir(join(directory, 'empty'))
  const service = new ReplayLibraryService(() => directory)
  await expect(service.analyzeReplay(scope, 'missing')).rejects.toThrow('not indexed')
  await expect(service.getAnalysis(scope, 'missing')).rejects.toThrow('not indexed')
})

it('keeps identical replay analyses independent across profiles', async () => {
  const source = join(directory, 'same.SC2Replay')
  const archive = await createMpq(source)
  await archive.add(Buffer.alloc(9), { archivePath: 'replay.attributes.events' })
  await archive.save()
  await archive.close()
  const other: ReplayScope = { ...scope, profileHandle: '2-S2-1-456' }
  await mkdir(join(directory, 'Accounts', '2', other.profileHandle), { recursive: true })
  const service = new ReplayLibraryService(() => directory)
  const first = await service.importFile(scope, source)
  const second = await service.importFile(other, source)
  expect(first.contentHash).toBe(second.contentHash)
  const analysis = await service.analyzeReplay(scope, first.id)
  expect(await service.getAnalysis(other, second.id)).toBeNull()
  await expect(service.getAnalysis(other, first.id)).rejects.toThrow('not indexed')
  const otherAnalysis = await service.analyzeReplay(other, second.id)
  expect(otherAnalysis.replayId).toBe(second.id)
  expect(analysis.replayId).toBe(first.id)
  await service.deleteReplay(scope, first.id)
  expect(await service.getAnalysis(other, second.id)).toEqual(otherAnalysis)
})
