import { afterEach, expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import {
  ipcReplayChooseExportPath,
  ipcReplayList,
  ipcReplayScanDirectory,
  ipcReplayIndexFile,
  ipcReplayImportArchive,
  ipcReplayDelete,
  ipcReplayAnalyze,
  ipcReplayGetAnalysis,
  ipcReplayExportArchive,
  ipcReplayDiscoverDirectories,
  ipcReplayListDuplicates,
} from '../replay'

afterEach(() => vi.unstubAllGlobals())
test('controlled replay wrappers forward arguments and preserve results', async () => {
  const result = { ok: true as const, data: [] }
  const replay = {
    list: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    scanDirectory: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    indexFile: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    importArchive: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    delete: vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ ok: true, data: undefined }),
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
test('foundation wrappers forward explicit IDs and export destination without exposing transport', async () => {
  const result = { ok: true, data: null }
  const replay = {
    chooseExportPath: vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok: true, data: null }),
    analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    getAnalysis: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    exportArchive: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    discoverDirectories: vi.fn<() => Promise<unknown>>().mockResolvedValue(result),
    listDuplicates: vi.fn<() => Promise<unknown>>().mockResolvedValue(result),
  }
  vi.stubGlobal('scnexus', { replay })
  expect(await ipcReplayChooseExportPath()).toEqual({ ok: true, data: null })
  expect(await ipcReplayAnalyze('id')).toBe(result)
  expect(await ipcReplayGetAnalysis('id')).toBe(result)
  expect(await ipcReplayExportArchive(['id'], 'D:\\out.zip')).toBe(result)
  expect(await ipcReplayDiscoverDirectories()).toBe(result)
  expect(await ipcReplayListDuplicates()).toBe(result)
  expect(replay.analyze).toHaveBeenCalledWith('id')
  expect(replay.getAnalysis).toHaveBeenCalledWith('id')
  expect(replay.exportArchive).toHaveBeenCalledWith(['id'], 'D:\\out.zip')
})

test('missing bridge, rejected transport, invalid envelopes, and failures return typed failures', async () => {
  vi.stubGlobal('scnexus', undefined)
  expect(await ipcReplayList()).toMatchObject({ ok: false })
  const list = vi
    .fn<(...args: unknown[]) => Promise<unknown>>()
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
