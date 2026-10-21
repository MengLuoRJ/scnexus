import { afterEach, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import type {
  AnalysisResult,
  ContentRecord,
  InstallProgress,
} from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
const mocks = vi.hoisted(() => ({
  list: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  active: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cancel: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  install: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  progress: vi.fn<(listener: (progress: InstallProgress) => void) => () => void>(),
  unsubscribe: vi.fn<() => void>(),
  prepare: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  activate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  removePreview: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  remove: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  scan: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('../../../ipcs/scii-game-setting', () => ({
  ipcGameSettingGet: async () => ({ ok: true, data: { gameRoot: 'D:\\Game', paths: {} } }),
}))
vi.mock('../../../ipcs/campaign', () => ({
  ipcCampaignList: mocks.list,
  ipcCampaignActive: mocks.active,
  ipcCampaignAnalyze: mocks.analyze,
  ipcCampaignCancel: mocks.cancel,
  ipcCampaignInstall: mocks.install,
  ipcCampaignOnInstallProgress: mocks.progress,
  ipcCampaignPrepareActivation: mocks.prepare,
  ipcCampaignActivate: mocks.activate,
  ipcCampaignPrepareDeactivation: mocks.removePreview,
  ipcCampaignPrepareUninstall: mocks.removePreview,
  ipcCampaignDeactivate: mocks.remove,
  ipcCampaignUninstall: mocks.remove,
  ipcCampaignScan: mocks.scan,
}))
import { useCampaign } from '../useCampaign'
const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop()
  vi.resetAllMocks()
})
function setup() {
  mocks.list.mockResolvedValue({ ok: true, data: { records: [] } })
  mocks.active.mockResolvedValue({ ok: true, data: { active: {} } })
  mocks.cancel.mockResolvedValue({ ok: true, data: undefined })
  mocks.progress.mockReturnValue(mocks.unsubscribe)
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(() => useCampaign())!
}
const analysis = {
  analysisId: 'a',
  recommendedMode: 'ccm',
  modes: { scnexus: {}, ccm: {}, auto: null },
  conflicts: [{ mode: 'ccm', files: [] }],
  existingInstallations: { scnexus: [], ccm: [], auto: [] },
} as unknown as AnalysisResult
const record = { localId: 'r', gameRoot: 'D:\\Game' } as ContentRecord

test('analysis selects recommendation, submits exact decisions and refreshes after install', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  mocks.install.mockResolvedValue({ ok: true, data: record })
  await service.analyze({ kind: 'directory', path: 'D:\\Package' })
  expect(service.mode.value).toBe('ccm')
  const result = await service.confirm([{ conflictId: 'c', action: 'keep' }], [])
  expect(result?.installed).toEqual(record)
  expect(mocks.install).toHaveBeenCalledWith({
    analysisId: 'a',
    taskId: expect.any(String),
    mode: 'ccm',
    decisions: [{ conflictId: 'c', action: 'keep' }],
  })
  expect(service.analysis.value).toBeNull()
  expect(mocks.list).toHaveBeenCalledOnce()
})
test('activation errors retain preview and original error for user correction', async () => {
  const service = setup()
  mocks.prepare.mockResolvedValue({
    ok: true,
    data: { activationId: 'act', localId: 'r', files: [], conflicts: [] },
  })
  const error = toErrorDto(new AppError(ERRORS.TASK_CONFLICT))
  mocks.activate.mockResolvedValue({ ok: false, error })
  await service.prepare(record, 'activate')
  await service.confirm([], [])
  expect(service.error.value?.errorId).toBe(error.errorId)
  expect(service.activation.value?.activationId).toBe('act')
  await service.close()
  expect(mocks.cancel).toHaveBeenCalledWith('act')
  expect(service.activation.value).toBeNull()
})
test('shared removal decisions are forwarded and inactive game records are excluded', async () => {
  const service = setup()
  mocks.removePreview.mockResolvedValue({
    ok: true,
    data: { removalId: 'rm', operation: 'uninstall', files: [] },
  })
  mocks.remove.mockResolvedValue({ ok: true, data: {} })
  mocks.list.mockResolvedValue({
    ok: true,
    data: { records: [record, { ...record, localId: 'other', gameRoot: 'D:\\Other' }] },
  })
  await service.prepare(record, 'uninstall')
  await service.confirm([], [{ conflictId: 'shared', action: 'keep' }])
  expect(mocks.remove).toHaveBeenCalledWith('rm', [{ conflictId: 'shared', action: 'keep' }])
  expect(service.records.value).toEqual([record])
})
test('unmount cancels a preview returned by in-flight analysis', async () => {
  const service = setup()
  let resolve: (value: unknown) => void = () => {}
  mocks.analyze.mockReturnValue(new Promise((done) => (resolve = done)))
  const operation = service.analyze({ kind: 'archive', path: 'D:\\package.zip' })
  await Promise.resolve()
  scopes[0]!.stop()
  resolve({ ok: true, data: analysis })
  await operation
  expect(mocks.cancel).toHaveBeenCalledWith('a')
  expect(service.analysis.value).toBeNull()
})

test('scan exposes diagnostics and deactivation refreshes active state', async () => {
  const service = setup()
  mocks.scan.mockResolvedValue({
    ok: true,
    data: { diagnostics: [{ path: 'broken', message: 'Invalid CCM package' }] },
  })
  await service.scan()
  expect(service.diagnostics.value).toEqual([{ path: 'broken', message: 'Invalid CCM package' }])
  mocks.removePreview.mockResolvedValue({
    ok: true,
    data: { removalId: 'off', operation: 'deactivate', files: [] },
  })
  mocks.remove.mockResolvedValue({ ok: true, data: {} })
  await service.prepare(record, 'deactivate')
  await service.confirm([], [])
  expect(mocks.remove).toHaveBeenCalledWith('off', [])
  expect(service.removal.value).toBeNull()
})

test('successful installation remains successful when the following list refresh fails', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  mocks.install.mockResolvedValue({ ok: true, data: record })
  const error = toErrorDto(new AppError(ERRORS.TASK_CONFLICT))
  mocks.list.mockResolvedValue({ ok: false, error })
  await service.analyze({ kind: 'directory', path: 'D:\\Package' })
  const result = await service.confirm([], [])
  expect(result?.installed).toEqual(record)
  expect(service.error.value).toEqual(error)
  expect(service.analysis.value).toBeNull()
  await service.confirm([], [])
  expect(mocks.install).toHaveBeenCalledOnce()
})

test('install progress ignores other tasks and unsubscribes after completion', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  mocks.install.mockImplementation(async (selection) => {
    const listener = mocks.progress.mock.calls[0]![0] as (value: InstallProgress) => void
    const progress = {
      taskId: (selection as { taskId: string }).taskId,
      analysisId: 'a',
      stage: 'copying',
      completedFiles: 1,
      totalFiles: 3,
      currentFile: 'map.SC2Map',
    } as InstallProgress
    listener({ ...progress, taskId: 'other' })
    expect(service.installProgress.value).toBeNull()
    listener({ ...progress, analysisId: 'other' })
    expect(service.installProgress.value).toBeNull()
    listener(progress)
    expect(service.installProgress.value).toEqual(progress)
    return { ok: true, data: record }
  })
  await service.analyze({ kind: 'directory', path: 'D:\\Package' })
  await service.confirm([], [])
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
})

test('install failure unsubscribes without discarding its preview', async () => {
  const service = setup()
  mocks.analyze.mockResolvedValue({ ok: true, data: analysis })
  mocks.install.mockResolvedValue({
    ok: false,
    error: toErrorDto(new AppError(ERRORS.TASK_CONFLICT)),
  })
  await service.analyze({ kind: 'directory', path: 'D:\\Package' })
  expect(await service.confirm([], [])).toBeUndefined()
  expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  expect(service.analysis.value?.analysisId).toBe('a')
})

test('descriptorless analysis selects auto and submits its exact selection', async () => {
  const service = setup()
  const auto = {
    ...analysis,
    recommendedMode: null,
    modes: { scnexus: null, ccm: null, auto: { origin: 'auto-detected' } },
    conflicts: [{ mode: 'auto', files: [{ conflictId: 'auto-conflict' }] }],
  } as unknown as AnalysisResult
  mocks.analyze.mockResolvedValue({ ok: true, data: auto })
  mocks.install.mockResolvedValue({ ok: true, data: record })
  await service.analyze({ kind: 'archive', path: 'D:\\Campaign.7z' })
  expect(service.mode.value).toBe('auto')
  expect(service.preview.value?.origin).toBe('auto-detected')
  expect(service.conflicts.value).toEqual([{ conflictId: 'auto-conflict' }])
  await service.confirm([{ conflictId: 'auto-conflict', action: 'keep' }], [])
  expect(mocks.install).toHaveBeenCalledWith({
    analysisId: 'a',
    taskId: expect.any(String),
    mode: 'auto',
    decisions: [{ conflictId: 'auto-conflict', action: 'keep' }],
  })
  expect(service.analysis.value).toBeNull()
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
  expect(service.acceptAnalysis({ ...analysis, contentType: 'campaign' } as AnalysisResult)).toBe(
    true,
  )
  expect(service.analysis.value?.analysisId).toBe('a')
  expect(mocks.analyze).not.toHaveBeenCalled()
  expect(service.acceptAnalysis({ ...analysis, contentType: 'customize' } as AnalysisResult)).toBe(
    false,
  )
})
