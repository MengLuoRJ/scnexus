import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../utils/7zip-wrapper', () => ({ SevenZipWrapper: class {} }))
vi.mock('../../../utils/application-data', () => ({
  getApplicationDataDirectory: vi.fn<() => string>(),
}))

import { getApplicationDataDirectory } from '../../../utils/application-data'
import { replayDatabase } from '../replay-db'
import { ReplayLibraryService } from '../replay'

let directory: string
let service: ReplayLibraryService

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'scnexus-replay-service-'))
  vi.mocked(getApplicationDataDirectory).mockReturnValue(directory)
  service = new ReplayLibraryService()
})

afterEach(async () => {
  replayDatabase.close()
  await rm(directory, { recursive: true, force: true })
})

describe('ReplayLibraryService', () => {
  it('manually scans nested replay files and keeps stable identities on reindex', async () => {
    const root = join(directory, 'replays')
    await mkdir(join(root, 'nested'), { recursive: true })
    await writeFile(join(root, 'a.SC2Replay'), 'candidate')
    await writeFile(join(root, 'nested', 'b.sc2replay'), 'candidate')
    await writeFile(join(root, 'notes.txt'), 'ignored')
    const first = await service.scanDirectory(root)
    expect(first).toHaveLength(2)
    const second = await service.scanDirectory(root)
    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id))
    expect(await service.listStoredReplays()).toHaveLength(2)
  })

  it('rejects non-replays and directories during indexing', async () => {
    await expect(service.indexReplayFile(join(directory, 'notes.txt'))).rejects.toThrow(
      'Expected a .SC2Replay file',
    )
    const path = join(directory, 'folder.SC2Replay')
    await mkdir(path)
    await expect(service.indexReplayFile(path)).rejects.toThrow('regular file')
  })

  it('only deletes indexed regular files and their stored index', async () => {
    const path = join(directory, 'a.SC2Replay')
    await writeFile(path, 'candidate')
    await expect(service.deleteReplay(path)).rejects.toThrow('not indexed')
    await service.indexReplayFile(path)
    await service.deleteReplay(path)
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await service.listStoredReplays()).toEqual([])
  })

  it('removes stale index entries when their file has already disappeared', async () => {
    const path = join(directory, 'a.SC2Replay')
    await writeFile(path, 'candidate')
    await service.indexReplayFile(path)
    await rm(path)
    await service.deleteReplay(path)
    expect(await service.listStoredReplays()).toEqual([])
  })

  it('does not recursively delete a directory replacing an indexed replay', async () => {
    const path = join(directory, 'a.SC2Replay')
    await writeFile(path, 'candidate')
    await service.indexReplayFile(path)
    await rm(path)
    await mkdir(path)
    const child = join(path, 'keep.txt')
    await writeFile(child, 'keep')
    await expect(service.deleteReplay(path)).rejects.toThrow('regular file')
    expect(await readFile(child, 'utf8')).toBe('keep')
    expect(await service.listStoredReplays()).toHaveLength(1)
  })
})
