import type { ReplayScope } from '@scnexus/app-shared/types/replay.type'
const scope: ReplayScope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }
vi.mock('../../../stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' } }))
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const launchReplay = vi.hoisted(() => vi.fn<(path: string) => Promise<void>>())
vi.mock('../../customize/client-launcher', () => ({ runReplayExecutable: launchReplay }))

const archiveMock = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  readFile: vi.fn<(...args: unknown[]) => Promise<Buffer>>(),
}))
vi.mock('../../../utils/7zip-wrapper', () => ({
  SevenZipWrapper: class {
    list = archiveMock.list
    readFile = archiveMock.readFile
  },
}))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))

import { getApplicationDataDirectory } from '../../../utils/application-data'
import { replayDatabase } from '../replay-db'
import { ReplayLibraryService } from '../replay'

let directory: string
let service: ReplayLibraryService

beforeEach(async () => {
  directory = await mkdtemp(join(process.cwd(), 'scnexus-replay-service-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  await mkdir(join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category), {
    recursive: true,
  })
  service = new ReplayLibraryService(() => directory)
  launchReplay.mockReset()
  launchReplay.mockResolvedValue(undefined)
  archiveMock.list.mockReset()
  archiveMock.readFile.mockReset()
})

afterEach(async () => {
  replayDatabase.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ReplayLibraryService', () => {
  function entry(path = 'nested/test.SC2Replay', extra = {}) {
    return { path, size: 9, isDirectory: false, attributes: 'A', properties: {}, ...extra }
  }

  it('imports only replay entries into a new directory without overwriting existing files', async () => {
    archiveMock.list.mockResolvedValue({ entries: [entry(), entry('notes.txt')] })
    archiveMock.readFile.mockResolvedValue(Buffer.from('candidate'))
    const first = await service.importReplayArchive(scope, 'pack.zip')
    const second = await service.importReplayArchive(scope, 'pack.zip')
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first[0]!.path).not.toBe(second[0]!.path)
    expect(await readFile(first[0]!.path, 'utf8')).toBe('candidate')
    expect(archiveMock.readFile).toHaveBeenCalledTimes(2)
  })

  it.each([
    '../escape.SC2Replay',
    'C:\\escape.SC2Replay',
    '/escape.SC2Replay',
    'a/CON.SC2Replay',
    'a/trailing./test.SC2Replay',
  ])('rejects unsafe import paths: %s', async (path) => {
    archiveMock.list.mockResolvedValue({ entries: [entry(path)] })
    await expect(service.importReplayArchive(scope, 'pack.zip')).rejects.toThrow('unsafe path')
    expect(archiveMock.readFile).not.toHaveBeenCalled()
  })

  it('rejects archive links, duplicate paths and oversized entries', async () => {
    for (const entries of [
      [entry('link.SC2Replay', { properties: { 'Symbolic Link': 'target' } })],
      [entry('a.SC2Replay'), entry('A.sc2replay')],
      [entry('a.SC2Replay', { size: 129 * 1024 * 1024 })],
    ]) {
      archiveMock.list.mockResolvedValue({ entries })
      await expect(service.importReplayArchive(scope, 'pack.zip')).rejects.toThrow(
        /links|duplicate|size limit/,
      )
    }
  })

  it('cleans incomplete imports when archive reads fail', async () => {
    archiveMock.list.mockResolvedValue({ entries: [entry()] })
    archiveMock.readFile.mockRejectedValue(new Error('read failed'))
    await expect(service.importReplayArchive(scope, 'pack.zip')).rejects.toThrow('read failed')
    expect((await readdir(directory)).some((name) => name.startsWith('pack-'))).toBe(false)
  })

  it('manually scans nested replay files and keeps stable identities on reindex', async () => {
    const root = join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category)
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'a.SC2Replay'), 'candidate')
    await writeFile(join(root, 'nested', 'b.sc2replay'), 'candidate')
    await writeFile(join(root, 'notes.txt'), 'ignored')
    const first = await service.scan(scope)
    expect(first).toHaveLength(2)
    const second = await service.scan(scope)
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id))
    expect(await service.listStoredReplays(scope)).toHaveLength(2)
  })

  it('rejects non-replays and directories during indexing', async () => {
    await expect(service.importFile(scope, join(directory, 'notes.txt'))).rejects.toThrow(
      'Expected a .SC2Replay file',
    )
    const path = join(directory, 'folder.SC2Replay')
    await mkdir(path)
    await expect(service.importFile(scope, path)).rejects.toThrow('regular file')
  })

  it('watches an indexed replay with spaces and non-ASCII without requiring parser support', async () => {
    const path = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
      '录像 & game.SC2Replay',
    )
    await writeFile(path, 'candidate')
    const record = (await service.scan(scope))[0]!
    await service.watchReplay(scope, record.id)
    expect(launchReplay).toHaveBeenCalledExactlyOnceWith(path)
    launchReplay.mockRejectedValueOnce(new Error('launch failed'))
    await expect(service.watchReplay(scope, record.id)).rejects.toThrow('launch failed')
  })

  it('does not launch unknown, cross-scope, missing or directory replay targets', async () => {
    const path = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
      'game.SC2Replay',
    )
    await writeFile(path, 'candidate')
    const record = (await service.scan(scope))[0]!
    await expect(service.watchReplay(scope, 'missing')).rejects.toThrow('not indexed')
    await expect(
      service.watchReplay({ ...scope, category: 'Campaign' }, record.id),
    ).rejects.toThrow('not indexed')
    await rm(path)
    await expect(service.watchReplay(scope, record.id)).rejects.toMatchObject({ code: 'ENOENT' })
    await mkdir(path)
    await expect(service.watchReplay(scope, record.id)).rejects.toThrow('regular')
    expect(launchReplay).not.toHaveBeenCalled()
  })

  it('rejects indexed replay paths outside the selected directory and non-replay extensions', async () => {
    const root = join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category)
    const path = join(root, 'game.SC2Replay')
    await writeFile(path, 'candidate')
    const record = (await service.scan(scope))[0]!
    const stored = vi.spyOn(replayDatabase, 'listReplays')
    try {
      stored.mockResolvedValue([{ ...record, path: join(directory, 'outside.SC2Replay') }])
      await expect(service.watchReplay(scope, record.id)).rejects.toThrow('not indexed')
      const textPath = join(root, 'notes.txt')
      await writeFile(textPath, 'keep')
      stored.mockResolvedValue([{ ...record, path: textPath }])
      await expect(service.watchReplay(scope, record.id)).rejects.toThrow('.SC2Replay')
      expect(launchReplay).not.toHaveBeenCalled()
    } finally {
      stored.mockRestore()
    }
  })

  it('rejects a junction substituted for an indexed replay parent', async () => {
    const root = join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category)
    const nested = join(root, 'nested')
    await mkdir(nested)
    await writeFile(join(nested, 'game.SC2Replay'), 'candidate')
    const record = (await service.scan(scope))[0]!
    const outside = join(directory, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'game.SC2Replay'), 'candidate')
    await rm(nested, { recursive: true })
    await symlink(outside, nested, 'junction')
    await expect(service.watchReplay(scope, record.id)).rejects.toThrow('link')
    expect(launchReplay).not.toHaveBeenCalled()
  })

  it('only deletes indexed regular files and their stored index', async () => {
    const path = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
      'a.SC2Replay',
    )
    await writeFile(path, 'candidate')
    await expect(
      service.deleteReplay(scope, (await service.listStoredReplays(scope))[0]?.id ?? 'missing'),
    ).rejects.toThrow('not indexed')
    await service.scan(scope)
    await service.deleteReplay(scope, (await service.listStoredReplays(scope))[0]?.id ?? 'missing')
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await service.listStoredReplays(scope)).toEqual([])
  })

  it('removes stale index entries when their file has already disappeared', async () => {
    const path = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
      'a.SC2Replay',
    )
    await writeFile(path, 'candidate')
    const record = (await service.scan(scope))[0]!
    await rm(path)
    expect(await service.listStoredReplays(scope)).toEqual([])
    await service.deleteReplay(scope, record.id)
    expect(await service.listStoredReplays(scope)).toEqual([])
  })

  it('does not recursively delete a directory replacing an indexed replay', async () => {
    const path = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
      'a.SC2Replay',
    )
    await writeFile(path, 'candidate')
    const record = (await service.scan(scope))[0]!
    await rm(path)
    await mkdir(path)
    const child = join(path, 'keep.txt')
    await writeFile(child, 'keep')
    await expect(service.deleteReplay(scope, record.id)).rejects.toThrow('regular file')
    expect(await readFile(child, 'utf8')).toBe('keep')
    expect(await service.listStoredReplays(scope)).toHaveLength(0)
  })
})
