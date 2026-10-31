import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ReplayScope } from '@scnexus/app-shared/types/replay.type'

vi.mock('electron', () => ({ app: { getPath: () => 'D:\\Documents' } }))
vi.mock('../../../stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('../../../utils/7zip-wrapper', () => ({ SevenZipWrapper: class {} }))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))
import { getApplicationDataDirectory } from '../../../utils/application-data'
import { replayDatabase } from '../replay-db'
import { ReplayLibraryService } from '../replay'
import { configuredReplayRoot, validateReplayScope } from '../replay-scope'

const scope: ReplayScope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }
const campaign: ReplayScope = { ...scope, category: 'Campaign' }
const other: ReplayScope = { ...scope, profileHandle: '2-S2-1-456' }
let directory: string
let root: string
let service: ReplayLibraryService
function profile(selected = scope) {
  return join(root, 'Accounts', '12345', selected.profileHandle)
}
function category(selected = scope) {
  return join(profile(selected), 'Replays', selected.category)
}
beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-scope-'))
  root = join(directory, 'StarCraft II')
  await mkdir(profile(), { recursive: true })
  await mkdir(profile(other), { recursive: true })
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  service = new ReplayLibraryService(() => root)
})
afterEach(async () => {
  replayDatabase.close()
  await rm(directory, { recursive: true, force: true })
})

it('discovers numeric accounts and unique handles, without requiring category folders', async () => {
  await mkdir(join(root, 'Accounts', 'not-an-account', '3-S2-1-789'), { recursive: true })
  expect((await service.profiles()).map((item) => item.handle)).toEqual([
    scope.profileHandle,
    other.profileHandle,
  ])
  expect(await service.scan(scope)).toEqual([])
  await expect(readFile(category())).rejects.toMatchObject({ code: 'ENOENT' })
  await mkdir(join(root, 'Accounts', '999', scope.profileHandle), { recursive: true })
  await expect(service.profiles()).rejects.toThrow('Ambiguous')
  await expect(service.scan(scope)).rejects.toThrow('Ambiguous')
})
it('uses the default StarCraft II documents root and rejects invalid scopes', () => {
  expect(configuredReplayRoot()).toBe(join('D:\\Documents', 'StarCraft II'))
  for (const input of [
    undefined,
    {},
    { ...scope, category: 'Unknown' },
    { ...scope, profileHandle: [scope.profileHandle] },
    { ...scope, profileHandle: '../x' },
  ])
    expect(() => validateReplayScope(input)).toThrow('Invalid replay scope')
})
it('copies external files and isolates categories, profiles, IDs and duplicate groups', async () => {
  const source = join(directory, 'source.SC2Replay')
  await writeFile(source, 'candidate')
  const first = await service.importFile(scope, source)
  const second = await service.importFile(other, source)
  const third = await service.importFile(campaign, source)
  expect(first.path.startsWith(category())).toBe(true)
  expect(first.path).not.toBe(source)
  expect(first.contentHash).toBe(second.contentHash)
  expect(new Set([first.id, second.id, third.id]).size).toBe(3)
  expect(await service.listStoredReplays(scope)).toEqual([first])
  expect(await service.listStoredReplays(campaign)).toEqual([third])
  expect(await service.listDuplicates(scope)).toEqual([])
  for (const invalidScope of [other, campaign]) {
    await expect(service.deleteReplay(invalidScope, first.id)).rejects.toThrow('not indexed')
    await expect(service.analyzeReplay(invalidScope, first.id)).rejects.toThrow('not indexed')
    await expect(service.getAnalysis(invalidScope, first.id)).rejects.toThrow('not indexed')
    await expect(
      service.exportReplayArchive(invalidScope, [first.id], join(directory, 'out.zip')),
    ).rejects.toThrow('not indexed')
  }
  await service.deleteReplay(scope, first.id)
  expect(await readFile(source, 'utf8')).toBe('candidate')
  expect(await readFile(second.path, 'utf8')).toBe('candidate')
})
it('hides stale records after changing roots even for identical profile handles', async () => {
  const source = join(directory, 'source.SC2Replay')
  await writeFile(source, 'candidate')
  const record = await service.importFile(scope, source)
  root = join(directory, 'another-root')
  await mkdir(profile(), { recursive: true })
  expect(await service.listStoredReplays(scope)).toEqual([])
  expect(await service.scan(scope)).toEqual([])
  await expect(service.getAnalysis(scope, record.id)).rejects.toThrow('not indexed')
  await expect(service.deleteReplay(scope, record.id)).rejects.toThrow('not indexed')
  expect(await readFile(record.path, 'utf8')).toBe('candidate')
})
it('migrates version 3 with null ownership and adopts a scoped rescan without changing UUID', async () => {
  await mkdir(category(), { recursive: true })
  const path = join(category(), 'legacy.SC2Replay')
  await writeFile(path, 'candidate')
  const record = (await service.scan(scope))[0]!
  replayDatabase.close()
  const db = new DatabaseSync(join(directory, 'SCNexusStorage', 'replay.db'))
  db.exec(
    'DROP INDEX replay_files_scope_idx; ALTER TABLE replay_files DROP COLUMN profile_handle; ALTER TABLE replay_files DROP COLUMN category; PRAGMA user_version = 3;',
  )
  db.close()
  await service.ensureReady()
  expect(await replayDatabase.listReplays()).toEqual([
    { ...record, profileHandle: null, category: null },
  ])
  expect(await service.listStoredReplays(scope)).toEqual([])
  expect((await service.scan(scope))[0]).toEqual(record)
})
it('never follows directory junctions or linked profile/category roots', async () => {
  const outside = join(directory, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'escape.SC2Replay'), 'candidate')
  await mkdir(category(), { recursive: true })
  await symlink(outside, join(category(), 'linked'), 'junction')
  expect(await service.scan(scope)).toEqual([])
  await rm(category(), { recursive: true })
  await symlink(outside, category(), 'junction')
  await expect(service.scan(scope)).rejects.toThrow('link')
  const source = join(directory, 'source.SC2Replay')
  await writeFile(source, 'candidate')
  await expect(service.importFile(scope, source)).rejects.toThrow('link')
})
it('does not trust an indexed ID whose stored path lies outside its category', async () => {
  const source = join(directory, 'source.SC2Replay')
  await writeFile(source, 'candidate')
  const record = await service.importFile(scope, source)
  await replayDatabase.upsertReplay({ ...record, id: 'outside', path: source })
  expect((await service.listStoredReplays(scope)).map((item) => item.id)).toEqual([record.id])
  await expect(service.deleteReplay(scope, 'outside')).rejects.toThrow('not indexed')
  await expect(service.getAnalysis(scope, 'outside')).rejects.toThrow('not indexed')
})
