import { afterEach, expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import {
  ipcReplayList,
  ipcReplayScanDirectory,
  ipcReplayIndexFile,
  ipcReplayImportArchive,
  ipcReplayDelete,
} from '../replay'

afterEach(() => vi.unstubAllGlobals())
test('controlled replay wrappers forward arguments and preserve results', async () => {
  const result = { ok: true as const, data: [] }
  const replay = {
    list: vi.fn().mockResolvedValue(result),
    scanDirectory: vi.fn().mockResolvedValue(result),
    indexFile: vi.fn().mockResolvedValue(result),
    importArchive: vi.fn().mockResolvedValue(result),
    delete: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  }
  vi.stubGlobal('scnexus', { replay })
  expect(await ipcReplayList()).toBe(result)
  expect(await ipcReplayScanDirectory('D:\\replays')).toBe(result)
  await ipcReplayIndexFile('D:\\replay.SC2Replay')
  await ipcReplayImportArchive('D:\\archive.zip', 'D:\\dest')
  expect(await ipcReplayDelete('D:\\replay.SC2Replay')).toEqual({ ok: true, data: undefined })
  expect(replay.scanDirectory).toHaveBeenCalledWith('D:\\replays')
  expect(replay.indexFile).toHaveBeenCalledWith('D:\\replay.SC2Replay')
  expect(replay.importArchive).toHaveBeenCalledWith('D:\\archive.zip', 'D:\\dest')
  expect(replay.delete).toHaveBeenCalledWith('D:\\replay.SC2Replay')
})
test('missing bridge, rejected transport, invalid envelopes, and failures return typed failures', async () => {
  vi.stubGlobal('scnexus', undefined)
  expect(await ipcReplayList()).toMatchObject({ ok: false })
  const list = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ invalid: true })
  vi.stubGlobal('scnexus', { replay: { list } })
  expect(await ipcReplayList()).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_TRANSPORT_FAILED.code },
  })
  expect(await ipcReplayList()).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_RESULT_INVALID.code },
  })
  const failure = { ok: false, error: toErrorDto(new AppError(ERRORS.IPC_INVALID_ARGUMENT)) }
  list.mockResolvedValueOnce(failure)
  expect(await ipcReplayList()).toBe(failure)
})
