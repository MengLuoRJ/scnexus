import { beforeEach, expect, test, vi } from 'vitest'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  saveDialog: vi.fn<(...args: unknown[]) => Promise<{ canceled: boolean; filePath?: string }>>(),
  service: {
    listStoredReplays: vi.fn(),
    analyzeReplay: vi.fn(),
    getAnalysis: vi.fn(),
    listDuplicates: vi.fn(),
    exportReplayArchive: vi.fn(),
    scanDirectory: vi.fn(),
    indexReplayFile: vi.fn(),
    importReplayArchive: vi.fn(),
    deleteReplay: vi.fn(),
  },
}))
vi.mock('electron', () => ({
  app: { getPath: () => 'D:\\Documents' },
  dialog: { showSaveDialog: mocks.saveDialog },
}))
vi.mock('../../../app-main/src/utils/ipc-util', () => ({
  ipcHandle: (channel: string, handler: (...args: unknown[]) => unknown) =>
    mocks.handlers.set(channel, handler),
}))
vi.mock('../../../app-main/src/modules/replay/replay', () => ({
  replayLibraryService: mocks.service,
}))
import { initReplayModule } from '../../../app-main/src/modules/replay/replay.ipc'

beforeEach(() => {
  vi.clearAllMocks()
  initReplayModule()
})
test('registers all replay methods with the trusted ipcHandle adapter', () => {
  expect([...mocks.handlers.keys()]).toEqual([
    'replay:choose-export-path',
    'replay:analyze',
    'replay:get-analysis',
    'replay:discover-directories',
    'replay:duplicates',
    'replay:export-archive',
    'replay:list',
    'replay:scan-directory',
    'replay:index-file',
    'replay:import-archive',
    'replay:delete',
  ])
  mocks.handlers.get('replay:list')!()
  mocks.handlers.get('replay:scan-directory')!('D:\\replays')
  mocks.handlers.get('replay:index-file')!('D:\\a.SC2Replay')
  mocks.handlers.get('replay:import-archive')!('D:\\pack.zip', 'D:\\dest')
  mocks.handlers.get('replay:delete')!('D:\\a.SC2Replay')
  expect(mocks.service.listStoredReplays).toHaveBeenCalledOnce()
  expect(mocks.service.scanDirectory).toHaveBeenCalledWith('D:\\replays')
  expect(mocks.service.indexReplayFile).toHaveBeenCalledWith('D:\\a.SC2Replay')
  expect(mocks.service.importReplayArchive).toHaveBeenCalledWith('D:\\pack.zip', 'D:\\dest')
  expect(mocks.service.deleteReplay).toHaveBeenCalledWith('D:\\a.SC2Replay')
})
test.each([undefined, null, 42, {}, '', ' ', 'relative.SC2Replay', 'D:\\bad\0.SC2Replay'])(
  'rejects malformed paths before service access: %j',
  (path) => {
    for (const channel of ['replay:scan-directory', 'replay:index-file', 'replay:delete']) {
      expect(() => mocks.handlers.get(channel)!(path)).toThrow(
        expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
      )
    }
    expect(() => mocks.handlers.get('replay:import-archive')!(path, 'D:\\dest')).toThrow()
    expect(() => mocks.handlers.get('replay:import-archive')!('D:\\pack.zip', path)).toThrow()
    expect(mocks.service.scanDirectory).not.toHaveBeenCalled()
    expect(mocks.service.indexReplayFile).not.toHaveBeenCalled()
    expect(mocks.service.importReplayArchive).not.toHaveBeenCalled()
    expect(mocks.service.deleteReplay).not.toHaveBeenCalled()
  },
)
test('export picker uses fixed ZIP options and cancellation returns null without writing', async () => {
  mocks.saveDialog.mockResolvedValueOnce({ canceled: true })
  expect(await mocks.handlers.get('replay:choose-export-path')!()).toBeNull()
  mocks.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: 'D:\\chosen.zip' })
  expect(await mocks.handlers.get('replay:choose-export-path')!()).toBe('D:\\chosen.zip')
  expect(mocks.saveDialog).toHaveBeenCalledWith({
    defaultPath: 'SCNexus-replays.zip',
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  })
  expect(mocks.service.exportReplayArchive).not.toHaveBeenCalled()
})

test('validates analysis record identifiers before service access', () => {
  for (const id of [undefined, null, 42, '', 'a'.repeat(101)]) {
    for (const channel of ['replay:analyze', 'replay:get-analysis']) {
      expect(() => mocks.handlers.get(channel)!(id)).toThrow(
        expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
      )
    }
  }
  mocks.handlers.get('replay:analyze')!('id')
  mocks.handlers.get('replay:get-analysis')!('id')
  expect(mocks.service.analyzeReplay).toHaveBeenCalledWith('id')
  expect(mocks.service.getAnalysis).toHaveBeenCalledWith('id')
})

test('validates export selection and destination before service access', () => {
  for (const ids of [
    [],
    null,
    ['id', 'id'],
    [42],
    Array.from({ length: 2001 }, (_, i) => String(i)),
  ]) {
    expect(() => mocks.handlers.get('replay:export-archive')!(ids, 'D:\\out.zip')).toThrow(
      expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
    )
  }
  expect(() => mocks.handlers.get('replay:export-archive')!(['id'], 'D:\\out.txt')).toThrow(
    expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
  )
  mocks.handlers.get('replay:export-archive')!(['id'], 'D:\\out.zip')
  expect(mocks.service.exportReplayArchive).toHaveBeenCalledWith(['id'], 'D:\\out.zip')
})

test('rejects incorrect file suffixes', () => {
  expect(() => mocks.handlers.get('replay:index-file')!('D:\\file.txt')).toThrow()
  expect(() => mocks.handlers.get('replay:delete')!('D:\\file.zip')).toThrow()
  expect(() => mocks.handlers.get('replay:import-archive')!('D:\\file.exe', 'D:\\dest')).toThrow()
})
