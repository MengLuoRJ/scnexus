import type { ReplayScope } from '@scnexus/app-shared/types/replay.type'
const scope: ReplayScope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }
vi.mock('../../../stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => '' } }))
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('../../../utils/operation-warnings', () => ({
  notifyOperation: vi.fn<() => void>(),
  reportOperationWarning: vi.fn<() => void>(),
}))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))

import { getApplicationDataDirectory } from '../../../utils/application-data'
import { SevenZipWrapper } from '../../../utils/7zip-wrapper'
import { ReplayLibraryService } from '../replay'
import { replayDatabase } from '../replay-db'

it('imports a real 7-Zip archive, persists its index across reopen, and deletes only the imported replay', async () => {
  const directory = await mkdtemp(join(process.cwd(), 'scnexus-replay-archive-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  await mkdir(join(directory, 'Accounts', '1', scope.profileHandle, 'Replays', scope.category), {
    recursive: true,
  })
  try {
    const input = join(directory, 'input')
    const destination = join(
      directory,
      'Accounts',
      '1',
      scope.profileHandle,
      'Replays',
      scope.category,
    )
    await mkdir(input)
    await mkdir(destination, { recursive: true })
    const replay = join(input, 'test.SC2Replay')
    await writeFile(replay, 'invalid replay candidate')
    await writeFile(join(input, 'ignore.txt'), 'not a replay')
    const archivePath = join(directory, 'pack.zip')
    await new SevenZipWrapper().add(archivePath, [replay, join(input, 'ignore.txt')], {
      archiveType: 'zip',
    })
    const service = new ReplayLibraryService(() => directory)
    const records = await service.importReplayArchive(scope, archivePath)
    expect(records).toHaveLength(1)
    expect(records[0]!.status).toBe('corrupt')
    expect(records[0]!.path.startsWith(destination)).toBe(true)
    expect(await readFile(records[0]!.path, 'utf8')).toBe('invalid replay candidate')
    expect(records[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/)
    const original = await service.importFile(scope, replay)
    expect((await service.listDuplicates(scope))[0]!.replays).toHaveLength(2)
    const exported = join(directory, 'exported.zip')
    expect(
      await service.exportReplayArchive(scope, [original.id, records[0]!.id], exported),
    ).toEqual({
      path: exported,
      count: 2,
    })
    const listing = await new SevenZipWrapper().list(exported)
    expect(listing.entries.filter((entry) => !entry.isDirectory)).toHaveLength(2)
    const bytes = await readFile(exported)
    await expect(service.exportReplayArchive(scope, [original.id], exported)).rejects.toMatchObject(
      {
        code: 'EEXIST',
      },
    )
    expect(await readFile(exported)).toEqual(bytes)
    const importedAgain = await service.importReplayArchive(scope, exported)
    expect(importedAgain).toHaveLength(2)
    expect(importedAgain.map((item) => item.contentHash)).toEqual([
      original.contentHash,
      original.contentHash,
    ])
    await writeFile(original.path, 'source changed')
    await expect(
      service.exportReplayArchive(scope, [original.id], join(directory, 'changed.zip')),
    ).rejects.toThrow('reindex before export')
    for (const record of importedAgain) await service.deleteReplay(scope, record.id)
    await replayDatabase.deleteReplayByPath(original.path)
    replayDatabase.close()
    expect(await service.listStoredReplays(scope)).toEqual(records)
    await service.deleteReplay(scope, records[0]!.id)
    expect(await service.listStoredReplays(scope)).toEqual([])
    expect(await readFile(replay, 'utf8')).toBe('invalid replay candidate')
  } finally {
    replayDatabase.close()
    await rm(directory, { recursive: true, force: true })
  }
})
