import { afterEach, expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import {
  ipcReplayChooseExportPath,
  ipcReplayList,
  ipcReplayScan,
  ipcReplayImportFile,
  ipcReplayImportArchive,
  ipcReplayDelete,
  ipcReplayAnalyze,
  ipcReplayGetAnalysis,
  ipcReplayExportArchive,
  ipcReplayProfiles,
  ipcReplayListDuplicates,
} from '../replay'

const scope = { profileHandle: '5-S2-1-2206060', category: 'Multiplayer' as const }
afterEach(() => vi.unstubAllGlobals())
test('controlled replay wrappers forward arguments and preserve results', async () => {
  const result = { ok: true as const, data: [] }
  const replay = {
    list: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    scan: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    importFile: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    importArchive: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    delete: vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ ok: true, data: undefined }),
  }
  vi.stubGlobal('scnexus', { replay })
  expect(await ipcReplayList(scope)).toBe(result)
  expect(await ipcReplayScan(scope)).toBe(result)
  await ipcReplayImportFile(scope, 'D:\\replay.SC2Replay')
  await ipcReplayImportArchive(scope, 'D:\\archive.zip')
  expect(await ipcReplayDelete(scope, 'id')).toEqual({ ok: true, data: undefined })
  expect(replay.scan).toHaveBeenCalledWith(scope)
  expect(replay.importFile).toHaveBeenCalledWith(scope, 'D:\\replay.SC2Replay')
  expect(replay.importArchive).toHaveBeenCalledWith(scope, 'D:\\archive.zip')
  expect(replay.delete).toHaveBeenCalledWith(scope, 'id')
})
test('foundation wrappers forward explicit IDs and export destination without exposing transport', async () => {
  const result = { ok: true, data: null }
  const replay = {
    chooseExportPath: vi.fn<() => Promise<unknown>>().mockResolvedValue({ ok: true, data: null }),
    analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    getAnalysis: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    exportArchive: vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(result),
    profiles: vi.fn<() => Promise<unknown>>().mockResolvedValue(result),
    listDuplicates: vi.fn<() => Promise<unknown>>().mockResolvedValue(result),
  }
  vi.stubGlobal('scnexus', { replay })
  expect(await ipcReplayChooseExportPath()).toEqual({ ok: true, data: null })
  expect(await ipcReplayAnalyze(scope, 'id')).toBe(result)
  expect(await ipcReplayGetAnalysis(scope, 'id')).toBe(result)
  expect(await ipcReplayExportArchive(scope, ['id'], 'D:\\out.zip')).toBe(result)
  expect(await ipcReplayProfiles()).toBe(result)
  expect(await ipcReplayListDuplicates(scope)).toBe(result)
  expect(replay.analyze).toHaveBeenCalledWith(scope, 'id')
  expect(replay.getAnalysis).toHaveBeenCalledWith(scope, 'id')
  expect(replay.exportArchive).toHaveBeenCalledWith(scope, ['id'], 'D:\\out.zip')
})

test('missing bridge, rejected transport, invalid envelopes, and failures return typed failures', async () => {
  vi.stubGlobal('scnexus', undefined)
  expect(await ipcReplayList(scope)).toMatchObject({ ok: false })
  const list = vi
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ invalid: true })
  vi.stubGlobal('scnexus', { replay: { list } })
  expect(await ipcReplayList(scope)).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_TRANSPORT_FAILED.code },
  })
  expect(await ipcReplayList(scope)).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_RESULT_INVALID.code },
  })
  const failure = { ok: false, error: toErrorDto(new AppError(ERRORS.IPC_INVALID_ARGUMENT)) }
  list.mockResolvedValueOnce(failure)
  expect(await ipcReplayList(scope)).toBe(failure)
})
