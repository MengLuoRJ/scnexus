import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('../../../utils/7zip-wrapper', () => ({ SevenZipWrapper: class {} }))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))
import { getApplicationDataDirectory } from '../../../utils/application-data'
import { createMpq } from '../../../utils/mpq'
import { replayDatabase } from '../replay-db'
import { ReplayLibraryService } from '../replay'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scnexus-analysis-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
})
afterEach(async () => {
  replayDatabase.close()
  await rm(directory, { recursive: true, force: true })
})

it('runs bounded component decoding in a worker, persists and invalidates by content', async () => {
  const path = join(directory, 'minimal.SC2Replay')
  const archive = await createMpq(path)
  const attributes = Buffer.alloc(9)
  await archive.add(attributes, { archivePath: 'replay.attributes.events' })
  await archive.save()
  await archive.close()
  const service = new ReplayLibraryService()
  const record = await service.indexReplayFile(path)
  const [a, b] = await Promise.all([
    service.analyzeReplay(record.id),
    service.analyzeReplay(record.id),
  ])
  expect(a).toEqual(b)
  expect(a.status).toBe('partial')
  expect(a.components.attributes).toMatchObject({
    attributes: [],
    protocolVersion: 'attributes-v1',
  })
  expect(a.warnings).toContain('Missing replay.initData')
  replayDatabase.close()
  expect(await service.getAnalysis(record.id)).toEqual(a)
  await writeFile(path, 'changed')
  expect(await service.getAnalysis(record.id)).toBeNull()
  await expect(service.analyzeReplay(record.id)).rejects.toThrow('reindex before analysis')
  await service.indexReplayFile(path)
  expect(await service.getAnalysis(record.id)).toBeNull()
})

it('keeps build-independent attributes but never falls back for unknown protocol builds', async () => {
  const path = join(directory, 'unknown.SC2Replay')
  const archive = await createMpq(path)
  await archive.add(Buffer.alloc(9), { archivePath: 'replay.attributes.events' })
  await archive.add(Buffer.from([0]), { archivePath: 'replay.initData' })
  await archive.add(Buffer.from([0]), { archivePath: 'replay.tracker.events' })
  await archive.save()
  await archive.close()
  const service = new ReplayLibraryService()
  const record = await service.indexReplayFile(path)
  await replayDatabase.upsertReplay({ ...record, baseBuild: 99999 })
  const analysis = await service.analyzeReplay(record.id)
  expect(analysis.status).toBe('partial')
  expect(analysis.components.initData).toBeNull()
  expect(analysis.components.tracker).toBeNull()
  expect(analysis.components.attributes).not.toBeNull()
  expect(
    analysis.warnings.filter((message) => message.includes('Unsupported replay base build: 99999')),
  ).toHaveLength(2)
  expect(await service.getAnalysis(record.id)).toEqual(analysis)
})

it('rejects analysis of unindexed files without creating arbitrary tasks', async () => {
  await mkdir(join(directory, 'empty'))
  const service = new ReplayLibraryService()
  await expect(service.analyzeReplay('missing')).rejects.toThrow('not indexed')
  expect(await service.getAnalysis('missing')).toBeNull()
})
