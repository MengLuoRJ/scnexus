import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
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
  const directory = await mkdtemp(join(tmpdir(), 'scnexus-replay-archive-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  try {
    const input = join(directory, 'input')
    const destination = join(directory, 'installed')
    await mkdir(input)
    await mkdir(destination)
    const replay = join(input, 'test.SC2Replay')
    await writeFile(replay, 'invalid replay candidate')
    await writeFile(join(input, 'ignore.txt'), 'not a replay')
    const archivePath = join(directory, 'pack.zip')
    await new SevenZipWrapper().add(archivePath, [replay, join(input, 'ignore.txt')], {
      archiveType: 'zip',
    })
    const service = new ReplayLibraryService()
    const records = await service.importReplayArchive(archivePath, destination)
    expect(records).toHaveLength(1)
    expect(records[0]!.status).toBe('corrupt')
    expect(records[0]!.path.startsWith(destination)).toBe(true)
    expect(await readFile(records[0]!.path, 'utf8')).toBe('invalid replay candidate')
    replayDatabase.close()
    expect(await service.listStoredReplays()).toEqual(records)
    await service.deleteReplay(records[0]!.path)
    expect(await service.listStoredReplays()).toEqual([])
    expect(await readFile(replay, 'utf8')).toBe('invalid replay candidate')
  } finally {
    replayDatabase.close()
    await rm(directory, { recursive: true, force: true })
  }
})
