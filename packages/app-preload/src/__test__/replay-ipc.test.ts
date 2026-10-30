import { beforeEach, expect, test, vi } from 'vitest'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  service: {
    listStoredReplays: vi.fn(),
    scanDirectory: vi.fn(),
    indexReplayFile: vi.fn(),
    importReplayArchive: vi.fn(),
    deleteReplay: vi.fn(),
  },
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
test('rejects incorrect file suffixes', () => {
  expect(() => mocks.handlers.get('replay:index-file')!('D:\\file.txt')).toThrow()
  expect(() => mocks.handlers.get('replay:delete')!('D:\\file.zip')).toThrow()
  expect(() => mocks.handlers.get('replay:import-archive')!('D:\\file.exe', 'D:\\dest')).toThrow()
})
