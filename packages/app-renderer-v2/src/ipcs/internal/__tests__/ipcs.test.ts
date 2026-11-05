import { afterEach, expect, test, vi } from 'vitest'
import * as ipcExports from '../../index'
import { effectScope } from 'vue'
import {
  AppError,
  ERRORS,
  toErrorDto,
  type AppErrorDto,
  type IpcResult,
} from '@scnexus/app-shared/errors/app.error'
import type { AiAssistantApi } from '@scnexus/app-shared/types/ai-assistant.type'
import type { InstallProgress } from '@scnexus/app-shared/types/content.type'
import { ipcRequest, ipcSubscription, ipcUnwrap } from '../ipc-common'
import {
  ipcGameSettingInitialize,
  ipcSettingUpdateKey,
  ipcShellOpenExternalWebsite,
  ipcShellOpenExternalDownload,
  ipcUpdaterOnError,
} from '../../index'

afterEach(() => {
  vi.unstubAllGlobals()
})
test('public IPC functions consistently use the ipc prefix', () => {
  const functions = Object.entries(ipcExports).filter(([, value]) => typeof value === 'function')
  expect(functions.length).toBeGreaterThan(0)
  for (const [name] of functions) expect(name).toMatch(/^ipc[A-Z]/)
})
test('preserves error code, errorId and taskId; validates malformed replies', async () => {
  const error = toErrorDto(new AppError(ERRORS.TASK_CONFLICT, { taskId: 'install' }))
  expect(await ipcRequest(async () => ({ ok: false, error }))).toEqual({ ok: false, error })
  expect(await ipcRequest(async () => ({ ok: false, error }))).toEqual({
    ok: false,
    error,
  })
  expect(await ipcRequest(async () => null as never)).toMatchObject({
    ok: false,
    error: { code: 'R001' },
  })
  expect(await ipcRequest(async () => ({}) as never)).toMatchObject({
    ok: false,
    error: { code: 'R001' },
  })
  expect(
    await ipcRequest(async () => {
      throw new Error('disconnected')
    }),
  ).toMatchObject({ ok: false, error: { code: 'P001' } })
  await expect(ipcUnwrap(Promise.resolve({ ok: false, error }))).rejects.toEqual(error)
  expect(await ipcRequest(async () => ({ ok: true, data: undefined }))).toEqual({
    ok: true,
    data: undefined,
  })
})
test('imports outside Electron and returns a structured missing-bridge error', async () => {
  expect(await ipcGameSettingInitialize()).toMatchObject({ ok: false, error: { code: 'P001' } })
})
test('forwards current typed and bridge APIs without changing parameters', async () => {
  const initialize = vi.fn<(path?: string) => Promise<IpcResult<Record<string, never>>>>(
    async () => ({ ok: true, data: {} }),
  )
  const updateKey = vi.fn<
    (key: string, value: string) => Promise<IpcResult<Record<string, never>>>
  >(async () => ({ ok: true, data: {} }))
  const shell = vi.fn<(url: string) => Promise<IpcResult<void>>>(async () => ({
    ok: true,
    data: undefined,
  }))
  vi.stubGlobal('window', {
    scnexus: { gameSetting: { initialize }, setting: { updateKey } },
    'shell:open-external-website': shell,
  })
  await ipcGameSettingInitialize('D:\\Game')
  expect(initialize).toHaveBeenCalledWith('D:\\Game')
  await ipcSettingUpdateKey('logLevel', 'debug')
  expect(updateKey).toHaveBeenCalledWith('logLevel', 'debug')
  await ipcShellOpenExternalWebsite('https://example.test')
  expect(shell).toHaveBeenCalledWith('https://example.test')
})
test('download uses its dedicated bridge and preserves structured errors', async () => {
  const url = 'https://example.test/file.zip?token=abc'
  const success = { ok: true as const, data: undefined }
  const download = vi.fn<(url: string) => Promise<IpcResult<void>>>().mockResolvedValue(success)
  const website = vi.fn<(url: string) => Promise<IpcResult<void>>>()
  vi.stubGlobal('window', {
    'shell:open-external-download': download,
    'shell:open-external-website': website,
  })
  expect(await ipcShellOpenExternalDownload(url)).toEqual(success)
  expect(download).toHaveBeenCalledExactlyOnceWith(url)
  expect(website).not.toHaveBeenCalled()
  const error = toErrorDto(new AppError(ERRORS.IPC_INVALID_ARGUMENT))
  download.mockResolvedValueOnce({ ok: false, error })
  expect(await ipcShellOpenExternalDownload(url)).toEqual({ ok: false, error })
  download.mockResolvedValueOnce({ ok: true } as never)
  expect(await ipcShellOpenExternalDownload(url)).toMatchObject({
    ok: false,
    error: { code: 'R001' },
  })
  vi.stubGlobal('window', {})
  expect(await ipcShellOpenExternalDownload(url)).toMatchObject({
    ok: false,
    error: { code: 'P001' },
  })
})
test('subscriptions auto-dispose in scope and allow idempotent manual disposal', () => {
  const dispose = vi.fn<() => void>()
  const scope = effectScope()
  let stop: () => void = () => {}
  scope.run(() => {
    stop = ipcSubscription(
      () => dispose,
      () => {},
    )
  })
  stop()
  scope.stop()
  expect(dispose).toHaveBeenCalledOnce()
  const manual = vi.fn<() => void>()
  const unsubscribe = ipcSubscription(
    () => manual,
    () => {},
  )
  unsubscribe()
  unsubscribe()
  expect(manual).toHaveBeenCalledOnce()
})
test('bridge events discard the Electron event and retain typed error details', () => {
  const dispose = vi.fn<() => void>()
  let callback: (event: object, data: unknown) => void = () => {}
  vi.stubGlobal('window', {
    'updater:error': (listener: typeof callback) => {
      callback = listener
      return dispose
    },
  })
  const listener = vi.fn<(error: AppErrorDto) => void>()
  const stop = ipcUpdaterOnError(listener)
  const error = toErrorDto(new AppError(ERRORS.UPDATER_CHECK_FAILED))
  callback({}, error)
  expect(listener).toHaveBeenCalledWith(error)
  stop()
  expect(dispose).toHaveBeenCalledOnce()
})

test('campaign reactive decisions are snapshotted before crossing contextBridge', async () => {
  const { reactive, isProxy } = await import('vue')
  const { ipcCampaignInstall, ipcCampaignActivate, ipcCampaignUninstall, ipcCampaignDeactivate } =
    await import('../../index')
  const received: unknown[] = []
  const capture = async (...args: unknown[]) => {
    received.push(args)
    return { ok: true, data: undefined }
  }
  vi.stubGlobal('window', {
    scnexus: {
      campaign: { install: capture, activate: capture, uninstall: capture, deactivate: capture },
    },
  })
  const decisions = reactive([{ conflictId: 'c', action: 'keep' as const }])
  await ipcCampaignInstall({ analysisId: 'a', mode: 'ccm', decisions })
  await ipcCampaignActivate('a', decisions)
  await ipcCampaignUninstall('r', decisions)
  await ipcCampaignDeactivate('r', decisions)
  function assertPlain(value: unknown) {
    expect(isProxy(value)).toBe(false)
    if (value && typeof value === 'object')
      for (const child of Object.values(value)) assertPlain(child)
  }
  received.forEach(assertPlain)
  expect(isProxy(decisions)).toBe(true)
  expect(received[0]).toEqual([
    { analysisId: 'a', mode: 'ccm', decisions: [{ conflictId: 'c', action: 'keep' }] },
  ])
})

test('campaign progress listener receives correlated DTOs and disposes with its scope', async () => {
  const { ipcCampaignOnInstallProgress } = await import('../../campaign')
  const dispose = vi.fn<() => void>()
  let callback: (progress: unknown) => void = () => {}
  vi.stubGlobal('window', {
    scnexus: {
      campaign: {
        onInstallProgress: (listener: typeof callback) => {
          callback = listener
          return dispose
        },
      },
    },
  })
  const listener = vi.fn<(progress: InstallProgress) => void>()
  const scope = effectScope()
  let stop = () => {}
  scope.run(() => {
    stop = ipcCampaignOnInstallProgress(listener)
  })
  const progress = {
    taskId: 'client-task',
    analysisId: 'analysis',
    stage: 'copying',
    completedFiles: 1,
    totalFiles: 4,
    currentFile: 'Maps/Campaign/Level.SC2Map',
  }
  callback(progress)
  expect(listener).toHaveBeenCalledExactlyOnceWith(progress)
  scope.stop()
  stop()
  expect(dispose).toHaveBeenCalledOnce()
})

test('unified content adapter snapshots input and preserves conflict/reanalysis responses', async () => {
  const { reactive, isProxy } = await import('vue')
  const { ipcContentAnalyze } = await import('../../content')
  const conflict = { ok: false, error: toErrorDto(new AppError(ERRORS.CONTENT_TYPE_CONFLICT)) }
  const analyze = vi
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValueOnce(conflict)
    .mockResolvedValueOnce({ ok: true, data: { contentType: 'campaign' } })
  vi.stubGlobal('window', { scnexus: { content: { analyze } } })
  const input = reactive({ kind: 'directory' as const, path: 'D:\\Source' })
  expect(await ipcContentAnalyze(input)).toEqual(conflict)
  expect(isProxy(analyze.mock.calls[0]![0])).toBe(false)
  expect(await ipcContentAnalyze(input, 'metadata-txt')).toEqual({
    ok: true,
    data: { contentType: 'campaign' },
  })
  expect(analyze).toHaveBeenLastCalledWith(
    { kind: 'directory', path: 'D:\\Source' },
    'metadata-txt',
  )
})

test('success warnings survive renderer adapter validation without turning into errors', async () => {
  const warning = toErrorDto(
    new AppError(ERRORS.CONTENT_CLEANUP_WARNING, { message: 'cleanup busy' }),
  )
  const response = { ok: true as const, data: { localId: 'record' }, warnings: [warning] }
  expect(await ipcRequest(async () => response)).toEqual(response)
  expect(
    await ipcRequest(async () => ({ ok: true, data: {}, warnings: [{ code: 'M062' }] }) as never),
  ).toMatchObject({ ok: false, error: { code: 'R001' } })
})

test('AI assistant IPC wrappers forward only typed operations and scope-dispose events', async () => {
  const status = { state: 'stopped' as const, port: 17861 }
  const record = { id: 'operation', toolName: 'list', status: 'running' as const, startedAt: 123 }
  const getStatus = vi.fn<AiAssistantApi['getStatus']>(async () => ({ ok: true, data: status }))
  const start = vi.fn<AiAssistantApi['start']>(async () => ({ ok: true, data: status }))
  const disposeStatus = vi.fn<() => void>()
  const disposeRecord = vi.fn<() => void>()
  const onStatusChanged = vi.fn<AiAssistantApi['onStatusChanged']>((listener) => {
    listener(status)
    return disposeStatus
  })
  const onRecordChanged = vi.fn<AiAssistantApi['onRecordChanged']>((listener) => {
    listener(record)
    return disposeRecord
  })
  vi.stubGlobal('window', {
    scnexus: { aiAssistant: { getStatus, start, onStatusChanged, onRecordChanged } },
  })
  expect(await ipcExports.ipcAiAssistantGetStatus()).toEqual({ ok: true, data: status })
  await ipcExports.ipcAiAssistantStart(17861)
  expect(start).toHaveBeenCalledExactlyOnceWith(17861)
  const scope = effectScope()
  const statusListener = vi.fn<Parameters<AiAssistantApi['onStatusChanged']>[0]>()
  const recordListener = vi.fn<Parameters<AiAssistantApi['onRecordChanged']>[0]>()
  scope.run(() => {
    ipcExports.ipcAiAssistantOnStatusChanged(statusListener)
    ipcExports.ipcAiAssistantOnRecordChanged(recordListener)
  })
  expect(statusListener).toHaveBeenCalledExactlyOnceWith(status)
  expect(recordListener).toHaveBeenCalledExactlyOnceWith(record)
  scope.stop()
  expect(disposeStatus).toHaveBeenCalledOnce()
  expect(disposeRecord).toHaveBeenCalledOnce()
})
