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
    scan: vi.fn(),
    profiles: vi.fn(),
    importFile: vi.fn(),
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
vi.mock('../../../app-main/src/stores/setting', () => ({ settingRepository: { getKey: () => '' } }))
vi.mock('../../../app-main/src/modules/replay/replay', () => ({
  replayLibraryService: mocks.service,
}))
import { initReplayModule } from '../../../app-main/src/modules/replay/replay.ipc'

beforeEach(() => {
  vi.clearAllMocks()
  initReplayModule()
})
const scope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }

test('registers scoped replay operations without unscoped path operations', () => {
  expect([...mocks.handlers.keys()]).toEqual([
    'replay:choose-export-path',
    'replay:profiles',
    'replay:analyze',
    'replay:get-analysis',
    'replay:duplicates',
    'replay:export-archive',
    'replay:list',
    'replay:scan',
    'replay:import-file',
    'replay:import-archive',
    'replay:delete',
  ])
  mocks.handlers.get('replay:scan')!(scope)
  mocks.handlers.get('replay:import-file')!(scope, 'D:\\a.SC2Replay')
  mocks.handlers.get('replay:import-archive')!(scope, 'D:\\pack.zip')
  mocks.handlers.get('replay:delete')!(scope, 'id')
  expect(mocks.service.scan).toHaveBeenCalledWith(scope)
  expect(mocks.service.importFile).toHaveBeenCalledWith(scope, 'D:\\a.SC2Replay')
  expect(mocks.service.importReplayArchive).toHaveBeenCalledWith(scope, 'D:\\pack.zip')
  expect(mocks.service.deleteReplay).toHaveBeenCalledWith(scope, 'id')
})
test.each([
  undefined,
  null,
  42,
  {},
  '',
  { profileHandle: '../escape', category: 'Campaign' },
  { ...scope, category: 'Unknown' },
])('rejects malformed scopes: %j', (value) => {
  for (const channel of [...mocks.handlers.keys()].filter(
    (key) => !['replay:profiles', 'replay:choose-export-path'].includes(key),
  ))
    expect(() => mocks.handlers.get(channel)!(value)).toThrow()
})
test.each([undefined, null, 42, {}, '', ' ', 'relative.SC2Replay', 'D:\\bad\0.SC2Replay'])(
  'rejects malformed import paths: %j',
  (path) => {
    for (const channel of ['replay:import-file', 'replay:import-archive'])
      expect(() => mocks.handlers.get(channel)!(scope, path)).toThrow(
        expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
      )
  },
)
test('validates identifiers and export selections', () => {
  for (const id of [undefined, null, 42, '', 'a'.repeat(101)])
    for (const channel of ['replay:delete', 'replay:analyze', 'replay:get-analysis'])
      expect(() => mocks.handlers.get(channel)!(scope, id)).toThrow()
  for (const ids of [
    [],
    null,
    ['id', 'id'],
    [42],
    Array.from({ length: 2001 }, (_, i) => String(i)),
  ])
    expect(() => mocks.handlers.get('replay:export-archive')!(scope, ids, 'D:\\out.zip')).toThrow()
  expect(() => mocks.handlers.get('replay:export-archive')!(scope, ['id'], 'D:\\out.txt')).toThrow()
  mocks.handlers.get('replay:export-archive')!(scope, ['id'], 'D:\\out.zip')
  expect(mocks.service.exportReplayArchive).toHaveBeenCalledWith(scope, ['id'], 'D:\\out.zip')
})
test('export picker uses fixed ZIP options and cancellation returns null', async () => {
  mocks.saveDialog.mockResolvedValueOnce({ canceled: true })
  expect(await mocks.handlers.get('replay:choose-export-path')!()).toBeNull()
  mocks.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: 'D:\\chosen.zip' })
  expect(await mocks.handlers.get('replay:choose-export-path')!()).toBe('D:\\chosen.zip')
})
