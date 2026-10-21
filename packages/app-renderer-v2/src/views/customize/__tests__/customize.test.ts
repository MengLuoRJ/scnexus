import { afterEach, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import { ERRORS, AppError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  AnalysisResult,
  ContentRecord,
  InstallProgress,
} from '@scnexus/app-shared/types/content.type'
const mocks = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancel: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  install: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  progress: vi.fn<(listener: (progress: InstallProgress) => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
  prepare: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  uninstall: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  scan: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('../../../ipcs/scii-game-setting', () => ({
  ipcGameSettingGet: async () => ({ ok: true, data: { gameRoot: 'D:\\Game', paths: {} } }),
}))
vi.mock('../../../ipcs/customize', () => ({
  ipcCustomizeList: mocks.list,
  ipcCustomizeAnalyze: mocks.analyze,
  ipcCustomizeCancel: mocks.cancel,
  ipcCustomizeInstall: mocks.install,
  ipcCustomizeOnInstallProgress: mocks.progress,
  ipcCustomizePrepareUninstall: mocks.prepare,
  ipcCustomizeUninstall: mocks.uninstall,
  ipcCustomizeScan: mocks.scan,
}))
import { useCustomize } from '../useCustomize'
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.resetAllMocks()
})
function setup() {
  mocks.list.mockResolvedValue({ ok: true, data: { records: [] } })
  mocks.cancel.mockResolvedValue({ ok: true, data: undefined })
  mocks.progress.mockReturnValue(mocks.unsubscribe)
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useCustomize())!
}
const record = { localId: 'r', gameRoot: 'D:\\Game' } as ContentRecord
const analysis = {
  analysisId: 'a',
  modes: { scnexus: {}, ccm: null, auto: null },
  conflicts: [],
  existingInstallations: { scnexus: [], ccm: [], auto: [] },
} as unknown as AnalysisResult

test.each(['scnexus', 'auto'] as const)(
  '%s custom install selects mode and returns actual record without activation',
  async (mode) => {
    const service = setup()
    mocks.analyze.mockResolvedValue({
      ok: true,
      data: {
        ...analysis,
        modes: {
          scnexus: mode === 'scnexus' ? {} : null,
          ccm: null,
          auto: mode === 'auto' ? {} : null,
        },
      },
    })
    mocks.install.mockResolvedValue({ ok: true, data: record })
    await service.analyze({ kind: 'archive', path: 'D:\\Custom.zip' })
    expect(service.mode.value).toBe(mode)
    const result = await service.confirm([{ conflictId: 'shared', action: 'keep' }], [])
    expect(result?.installed).toEqual(record)
    expect(mocks.install).toHaveBeenCalledWith({
      analysisId: 'a',
      taskId: expect.any(String),
      mode,
      decisions: [{ conflictId: 'shared', action: 'keep' }],
    })
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
    expect(service.analysis.value).toBeNull()
  },
)

test('uninstall forwards exact shared-file decisions and filters records by game root', async () => {
  const service = setup()
  mocks.prepare.mockResolvedValue({
    ok: true,
    data: { removalId: 'rm', localId: 'r', operation: 'uninstall', files: [] },
  })
  mocks.uninstall.mockResolvedValue({ ok: true, data: {} })
  mocks.list.mockResolvedValue({
    ok: true,
    data: { records: [record, { ...record, localId: 'other', gameRoot: 'D:\\Other' }] },
  })
  await service.prepare(record)
  await service.confirm([], [{ conflictId: 'c', action: 'keep' }])
  expect(mocks.uninstall).toHaveBeenCalledWith('rm', [{ conflictId: 'c', action: 'keep' }])
  expect(service.records.value).toEqual([record])
})

test('progress ignores unrelated tasks and cleans up after a failed install', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  mocks.install.mockImplementation(async (selection) => {
    const listener = mocks.progress.mock.calls[0]![0]
    const progress = {
      taskId: (selection as { taskId: string }).taskId,
      analysisId: 'a',
      stage: 'copying',
      completedFiles: 1,
      totalFiles: 2,
      currentFile: 'map',
    } as InstallProgress
    listener({ ...progress, taskId: 'other' })
    expect(service.installProgress.value).toBeNull()
    listener(progress)
    expect(service.installProgress.value).toEqual(progress)
    return { ok: false, error: toErrorDto(new AppError(ERRORS.TASK_CONFLICT)) }
  })
  await service.analyze({ kind: 'directory', path: 'D:\\Custom' })
  expect(await service.confirm([], [])).toBeUndefined()
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  expect(service.analysis.value?.analysisId).toBe('a')
})

test('scope disposal cancels delayed custom analysis', async () => {
  const service = setup()
  let complete!: (value: unknown) => void
  mocks.analyze.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve
    }),
  )
  const pending = service.analyze({ kind: 'directory', path: 'D:\\Custom' })
  await Promise.resolve()
  scopes[0]!.stop()
  complete({ ok: true, data: analysis })
  await pending
  expect(mocks.cancel).toHaveBeenCalledWith('a')
  expect(service.analysis.value).toBeNull()
})

test('custom installation result is retained when list refresh fails', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  mocks.install.mockResolvedValue({ ok: true, data: record })
  const error = toErrorDto(new AppError(ERRORS.TASK_CONFLICT))
  mocks.list.mockResolvedValue({ ok: false, error })
  await service.analyze({ kind: 'directory', path: 'D:\\Custom' })
  expect((await service.confirm([], []))?.installed).toEqual(record)
  expect(service.analysis.value).toBeNull()
  expect(service.error.value).toEqual(error)
  await service.confirm([], [])
  expect(mocks.install).toHaveBeenCalledOnce()
})

test('cleanup warning preserves committed installation and is exposed to the page', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  const warning = toErrorDto(
    new AppError(ERRORS.CONTENT_CLEANUP_WARNING, { message: 'cleanup EBUSY' }),
  )
  mocks.install.mockResolvedValue({ ok: true, data: record, warnings: [warning] })
  await service.analyze({ kind: 'directory', path: 'D:\\Content' })
  const result = await service.confirm([], [])
  expect(result?.installed).toEqual(record)
  expect(service.error.value).toBeNull()
  expect(service.warnings.value).toEqual([warning])
  expect(service.analysis.value).toBeNull()
  await service.refresh()
  expect(service.warnings.value).toEqual([])
})

test('adopts classified preview without repeating IPC analysis and rejects wrong domain', () => {
  const service = setup()
  expect(service.acceptAnalysis({ ...analysis, contentType: 'customize' } as AnalysisResult)).toBe(
    true,
  )
  expect(service.analysis.value?.analysisId).toBe('a')
  expect(mocks.analyze).not.toHaveBeenCalled()
  expect(service.acceptAnalysis({ ...analysis, contentType: 'campaign' } as AnalysisResult)).toBe(
    false,
  )
})
