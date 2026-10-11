import { afterEach, expect, test, vi } from 'vitest'
vi.mock('electron', () => ({ app: { isPackaged: false } }))
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { ContentService } from '../content-package'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import type {
  ContentStore,
  CampaignActiveStoreData,
  InstallProgress,
} from '@scnexus/app-shared/types/content.type'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
function index<T>(data: T) {
  return {
    getSnapshot: () => structuredClone(data),
    update(next: T) {
      data = structuredClone(next)
      return this.getSnapshot()
    },
  }
}
async function fixture(mode: 'scnexus' | 'ccm' = 'scnexus', keepMod = false) {
  const root = join(process.cwd(), '.install-progress-' + randomUUID())
  roots.push(root)
  const game = join(root, 'game')
  const source = join(root, 'source')
  await mkdir(game, { recursive: true })
  await mkdir(join(source, 'Maps', 'Campaign'), { recursive: true })
  await mkdir(join(source, 'Mods'))
  await writeFile(join(source, 'Mods', 'Core.SC2Mod'), 'new mod')
  if (mode === 'scnexus') {
    await writeFile(
      join(source, 'package.json'),
      JSON.stringify({
        name: 'Progress',
        description: 'Progress',
        author: 'Tester',
        version: '1',
        type: 'campaign',
        campaign: 'WOL',
        mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }],
      }),
    )
    await writeFile(join(source, 'Maps', 'Campaign', 'Level.SC2Map'), 'map')
  } else {
    await writeFile(
      join(source, 'metadata.txt'),
      'title=Progress\ndesc=d\nauthor=A\nversion=1\ncampaign=WOL',
    )
    await writeFile(join(source, 'Level.SC2Map'), 'map')
  }
  const paths = gamePaths(game, join(root, 'documents'))
  if (keepMod) {
    await mkdir(paths.modsRoot, { recursive: true })
    await writeFile(join(paths.modsRoot, 'Core.SC2Mod'), 'kept mod')
  }
  const initial: ContentStore = {
    _schemaVersion: 2,
    _revision: 0,
    records: [],
    legacyRecords: [],
    scannedAt: null,
  }
  const campaign = index(initial)
  const service = new ContentService(
    async () => paths,
    campaign,
    index(initial),
    index<CampaignActiveStoreData>({
      _schemaVersion: 2,
      _revision: 0,
      active: {},
      legacyRecords: [],
      scannedAt: null,
    }),
    async (run) => run(),
  )
  const analysis = await service.analyze('campaign', { kind: 'directory', path: source })
  const selection = {
    analysisId: analysis.analysisId,
    mode,
    taskId: 'client-task',
    decisions: analysis.conflicts
      .find((group) => group.mode === mode)!
      .files.map((file) => ({
        conflictId: file.conflictId,
        action: keepMod ? ('keep' as const) : ('overwrite' as const),
      })),
  }
  return { service, paths, campaign, selection }
}

test('reports only completed real writes, stable totals and completion after persistence', async () => {
  const f = await fixture()
  const events: InstallProgress[] = []
  const reads: Promise<string>[] = []
  const record = await f.service.install(f.selection, 'campaign', (progress) => {
    events.push(progress)
    if (progress.currentFile)
      reads.push(readFile(join(f.paths.gameRoot, progress.currentFile), 'utf8'))
    if (progress.stage === 'completed') expect(f.campaign.getSnapshot().records).toHaveLength(1)
  })
  expect(events[0]).toMatchObject({ stage: 'preparing', completedFiles: 0, totalFiles: 0 })
  const writes = events.filter((event) => event.currentFile)
  expect(writes.map((event) => event.completedFiles)).toEqual([1, 2, 3, 4])
  expect(writes.map((event) => event.totalFiles)).toEqual([4, 4, 4, 4])
  expect(events.map((event) => event.stage)).toContain('finalizing')
  expect(events.at(-1)).toEqual({
    taskId: 'client-task',
    analysisId: f.selection.analysisId,
    stage: 'completed',
    completedFiles: 4,
    totalFiles: 4,
    currentFile: null,
  })
  expect(events.every((event) => event.taskId === 'client-task')).toBe(true)
  expect(await Promise.all(reads)).toHaveLength(4)
  expect(record.fileCount).toBe(2)
})

test.each([false, true])(
  'CCM counts separate payload and direct mod writes; keep=%s',
  async (keep) => {
    const f = await fixture('ccm', keep)
    const events: InstallProgress[] = []
    await f.service.install(f.selection, 'campaign', (progress) => events.push(progress))
    const total = keep ? 3 : 4
    expect(events.filter((event) => event.currentFile)).toHaveLength(total)
    expect(events.at(-1)).toMatchObject({
      stage: 'completed',
      completedFiles: total,
      totalFiles: total,
    })
    expect(await readFile(join(f.paths.modsRoot, 'Core.SC2Mod'), 'utf8')).toBe(
      keep ? 'kept mod' : 'new mod',
    )
  },
)

test('cancelled partial copy reports failure, rolls back and never completes', async () => {
  const f = await fixture()
  const events: InstallProgress[] = []
  await expect(
    f.service.install(f.selection, 'campaign', (progress) => {
      events.push(progress)
      if (progress.currentFile && progress.completedFiles === 1)
        f.service.cancel(f.selection.analysisId)
    }),
  ).rejects.toMatchObject({ code: 'M049' })
  expect(events.at(-1)).toMatchObject({ stage: 'failed', completedFiles: 1, totalFiles: 4 })
  expect(events.some((event) => event.stage === 'completed')).toBe(false)
  expect(f.campaign.getSnapshot().records).toEqual([])
  const written = events.find((event) => event.currentFile)!.currentFile!
  await expect(readFile(join(f.paths.gameRoot, written))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('persistence failure reports failed even when all files had been copied', async () => {
  const f = await fixture()
  vi.spyOn(f.campaign, 'update').mockImplementation(() => {
    throw new Error('store failure')
  })
  const events: InstallProgress[] = []
  await expect(
    f.service.install(f.selection, 'campaign', (progress) => events.push(progress)),
  ).rejects.toThrow('store failure')
  expect(events.at(-1)).toMatchObject({ stage: 'failed', completedFiles: 4, totalFiles: 4 })
  expect(events.some((event) => event.stage === 'completed')).toBe(false)
})

test('omitted task ID correlates by analysis ID; invalid task IDs fail before reporting', async () => {
  const f = await fixture()
  const callback = vi.fn()
  await expect(
    f.service.install({ ...f.selection, taskId: '' }, 'campaign', callback),
  ).rejects.toMatchObject({ code: 'M003' })
  expect(callback).not.toHaveBeenCalled()
  await f.service.install({ ...f.selection, taskId: undefined }, 'campaign', callback)
  expect(
    callback.mock.calls.every(([progress]) => progress.taskId === f.selection.analysisId),
  ).toBe(true)
})
