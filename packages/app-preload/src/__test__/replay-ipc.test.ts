import { beforeEach, expect, test, vi } from 'vitest'
import { ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  saveDialog: vi.fn<(...args: unknown[]) => Promise<{ canceled: boolean; filePath?: string }>>(),
  service: {
    listStoredReplays:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.listStoredReplays
      >(),
    watchReplay: vi.fn<(...args: unknown[]) => Promise<void>>(),
    analyzeReplay:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.analyzeReplay
      >(),
    getAnalysis:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.getAnalysis
      >(),
    getObserverWindow:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.getObserverWindow
      >(),
    listDuplicates:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.listDuplicates
      >(),
    exportReplayArchive:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.exportReplayArchive
      >(),
    scan: vi.fn<
      typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.scan
    >(),
    profiles:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.profiles
      >(),
    importFile:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.importFile
      >(),
    importReplayArchive:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.importReplayArchive
      >(),
    deleteReplay:
      vi.fn<
        typeof import('../../../app-main/src/modules/replay/replay').replayLibraryService.deleteReplay
      >(),
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

const analysis: ReplayAnalysis = {
  replayId: 'id',
  contentHash: 'a'.repeat(64),
  parserVersion: 'test-v1',
  baseBuild: 98310,
  status: 'completed',
  analyzedAt: '2026-11-09T00:00:00Z',
  warnings: [],
  components: { initData: null, attributes: null, tracker: null },
  spatial: {
    version: 1,
    baseBuild: 98310,
    durationGameLoops: 100,
    partial: false,
    diagnostics: [],
    units: [],
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.service.analyzeReplay.mockResolvedValue(analysis)
  mocks.service.getAnalysis.mockResolvedValue(null)
  initReplayModule()
})
const scope = { profileHandle: '1-S2-1-123', category: 'Multiplayer' }

test('registers scoped replay operations without unscoped path operations', () => {
  expect([...mocks.handlers.keys()]).toEqual([
    'replay:choose-export-path',
    'replay:profiles',
    'replay:watch',
    'replay:analyze',
    'replay:get-analysis',
    'replay:observer-window',
    'replay:duplicates',
    'replay:export-archive',
    'replay:list',
    'replay:scan',
    'replay:import-file',
    'replay:import-archive',
    'replay:delete',
  ])
  mocks.handlers.get('replay:watch')!(scope, 'id')
  expect(mocks.service.watchReplay).toHaveBeenCalledWith(scope, 'id')
  mocks.handlers.get('replay:scan')!(scope)
  mocks.handlers.get('replay:import-file')!(scope, 'D:\\a.SC2Replay')
  mocks.handlers.get('replay:import-archive')!(scope, 'D:\\pack.zip')
  mocks.handlers.get('replay:delete')!(scope, 'id')
  expect(mocks.service.scan).toHaveBeenCalledWith(scope)
  expect(mocks.service.importFile).toHaveBeenCalledWith(scope, 'D:\\a.SC2Replay')
  expect(mocks.service.importReplayArchive).toHaveBeenCalledWith(scope, 'D:\\pack.zip')
  expect(mocks.service.deleteReplay).toHaveBeenCalledWith(scope, 'id')
})
test('forwards the virtual cooperative scope without exposing directory selection', () => {
  const coop = { ...scope, category: 'Coop' }
  mocks.handlers.get('replay:scan')!(coop)
  mocks.handlers.get('replay:watch')!(coop, 'coop-replay')
  mocks.handlers.get('replay:analyze')!(coop, 'coop-replay')
  expect(mocks.service.scan).toHaveBeenCalledWith(coop)
  expect(mocks.service.watchReplay).toHaveBeenCalledWith(coop, 'coop-replay')
  expect(mocks.service.analyzeReplay).toHaveBeenCalledWith(coop, 'coop-replay')
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
    expect(() => mocks.handlers.get(channel)!(value)).toThrow(
      expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
    )
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
    for (const channel of [
      'replay:watch',
      'replay:delete',
      'replay:analyze',
      'replay:get-analysis',
      'replay:observer-window',
    ])
      expect(() => mocks.handlers.get(channel)!(scope, id)).toThrow(
        expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
      )
  for (const ids of [
    [],
    null,
    ['id', 'id'],
    [42],
    Array.from({ length: 2001 }, (_, i) => String(i)),
  ])
    expect(() => mocks.handlers.get('replay:export-archive')!(scope, ids, 'D:\\out.zip')).toThrow(
      expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
    )
  expect(() => mocks.handlers.get('replay:export-archive')!(scope, ['id'], 'D:\\out.txt')).toThrow(
    expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
  )
  mocks.handlers.get('replay:export-archive')!(scope, ['id'], 'D:\\out.zip')
  expect(mocks.service.exportReplayArchive).toHaveBeenCalledWith(scope, ['id'], 'D:\\out.zip')
})
test('export picker uses fixed ZIP options and cancellation returns null', async () => {
  mocks.saveDialog.mockResolvedValueOnce({ canceled: true })
  expect(await mocks.handlers.get('replay:choose-export-path')!()).toBeNull()
  mocks.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: 'D:\\chosen.zip' })
  expect(await mocks.handlers.get('replay:choose-export-path')!()).toBe('D:\\chosen.zip')
})

test('analysis IPC replies omit raw components and expose windowed observer data', async () => {
  mocks.service.getAnalysis.mockResolvedValue(analysis)
  for (const channel of ['replay:analyze', 'replay:get-analysis']) {
    const result = await mocks.handlers.get(channel)!(scope, 'id')
    expect(result).not.toHaveProperty('spatial')
    expect(result).not.toHaveProperty('components')
    expect(result).toMatchObject({
      observer: {
        replayId: 'id',
        contentHash: analysis.contentHash,
        history: { durationGameLoops: 100 },
      },
    })
  }
  expect(analysis).toHaveProperty('spatial')
  expect(analysis).toHaveProperty('components')
})

test('observer window IPC validates identity arguments and forwards scoped fractional targets', async () => {
  const request = {
    contentHash: analysis.contentHash,
    parserVersion: analysis.parserVersion,
    gameLoop: 40.5,
  }
  const response = {
    replayId: 'id',
    contentHash: analysis.contentHash,
    parserVersion: analysis.parserVersion,
    fromGameLoop: 0,
    toGameLoop: 100,
    timeline: { durationGameLoops: 100, units: [] },
  }
  mocks.service.getObserverWindow.mockResolvedValue(response)
  expect(await mocks.handlers.get('replay:observer-window')!(scope, 'id', request)).toBe(response)
  expect(mocks.service.getObserverWindow).toHaveBeenCalledWith(scope, 'id', request)
})

test.each([
  undefined,
  null,
  [],
  {},
  { contentHash: 'bad', parserVersion: 'v1', gameLoop: 0 },
  { contentHash: 'a'.repeat(64), parserVersion: 'v1', gameLoop: Infinity },
])('observer window IPC rejects malformed requests: %j', (request) => {
  expect(() => mocks.handlers.get('replay:observer-window')!(scope, 'id', request)).toThrow(
    expect.objectContaining({ code: ERRORS.IPC_INVALID_ARGUMENT.code }),
  )
  expect(mocks.service.getObserverWindow).not.toHaveBeenCalled()
})
