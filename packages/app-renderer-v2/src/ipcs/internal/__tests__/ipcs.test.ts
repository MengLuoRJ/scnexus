import { afterEach, expect, test, vi } from 'vitest'
import { effectScope } from 'vue'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import { request, subscription, unwrap } from '../ipc-common'
import {
  apiGameSettingInitialize,
  apiSettingUpdateKey,
  apiShellOpenExternalWebsite,
  apiUpdaterOnError,
} from '../../index'

afterEach(() => {
  vi.unstubAllGlobals()
})
test('preserves error code, errorId and taskId; validates malformed replies', async () => {
  const error = toErrorDto(new AppError(ERRORS.TASK_CONFLICT, { taskId: 'install' }))
  expect(await request(async () => ({ ok: false, error }))).toEqual({ ok: false, error })
  expect(await request(async () => ({ ok: false, error }))).toEqual({
    ok: false,
    error,
  })
  expect(await request(async () => null as never)).toMatchObject({
    ok: false,
    error: { code: 'R001' },
  })
  expect(await request(async () => ({}) as never)).toMatchObject({
    ok: false,
    error: { code: 'R001' },
  })
  expect(
    await request(async () => {
      throw new Error('disconnected')
    }),
  ).toMatchObject({ ok: false, error: { code: 'P001' } })
  await expect(unwrap(Promise.resolve({ ok: false, error }))).rejects.toEqual(error)
  expect(await request(async () => ({ ok: true, data: undefined }))).toEqual({
    ok: true,
    data: undefined,
  })
})
test('imports outside Electron and returns a structured missing-bridge error', async () => {
  expect(await apiGameSettingInitialize()).toMatchObject({ ok: false, error: { code: 'P001' } })
})
test('forwards current typed and bridge APIs without changing parameters', async () => {
  const initialize = vi.fn(async () => ({ ok: true, data: {} }))
  const updateKey = vi.fn(async () => ({ ok: true, data: {} }))
  const shell = vi.fn(async () => ({ ok: true, data: undefined }))
  vi.stubGlobal('window', {
    scnexus: { gameSetting: { initialize }, setting: { updateKey } },
    'shell:open-external-website': shell,
  })
  await apiGameSettingInitialize('D:\\Game')
  expect(initialize).toHaveBeenCalledWith('D:\\Game')
  await apiSettingUpdateKey('logLevel', 'debug')
  expect(updateKey).toHaveBeenCalledWith('logLevel', 'debug')
  await apiShellOpenExternalWebsite('https://example.test')
  expect(shell).toHaveBeenCalledWith('https://example.test')
})
test('subscriptions auto-dispose in scope and allow idempotent manual disposal', () => {
  const dispose = vi.fn()
  const scope = effectScope()
  let stop: () => void = () => {}
  scope.run(() => {
    stop = subscription(
      () => dispose,
      () => {},
    )
  })
  stop()
  scope.stop()
  expect(dispose).toHaveBeenCalledOnce()
  const manual = vi.fn()
  const unsubscribe = subscription(
    () => manual,
    () => {},
  )
  unsubscribe()
  unsubscribe()
  expect(manual).toHaveBeenCalledOnce()
})
test('bridge events discard the Electron event and retain typed error details', () => {
  const dispose = vi.fn()
  let callback: (event: object, data: unknown) => void = () => {}
  vi.stubGlobal('window', {
    'updater:error': (listener: typeof callback) => {
      callback = listener
      return dispose
    },
  })
  const listener = vi.fn()
  const stop = apiUpdaterOnError(listener)
  const error = toErrorDto(new AppError(ERRORS.UPDATER_CHECK_FAILED))
  callback({}, error)
  expect(listener).toHaveBeenCalledWith(error)
  stop()
  expect(dispose).toHaveBeenCalledOnce()
})

test('campaign reactive decisions are snapshotted before crossing contextBridge', async () => {
  const { reactive, isProxy } = await import('vue')
  const { apiCampaignInstall, apiCampaignActivate, apiCampaignUninstall, apiCampaignDeactivate } =
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
  await apiCampaignInstall({ analysisId: 'a', mode: 'ccm', decisions })
  await apiCampaignActivate('a', decisions)
  await apiCampaignUninstall('r', decisions)
  await apiCampaignDeactivate('r', decisions)
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
  const { apiCampaignOnInstallProgress } = await import('../../campaign')
  const dispose = vi.fn()
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
  const listener = vi.fn()
  const scope = effectScope()
  let stop = () => {}
  scope.run(() => {
    stop = apiCampaignOnInstallProgress(listener)
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
  const { apiContentAnalyze } = await import('../../content')
  const conflict = { ok: false, error: toErrorDto(new AppError(ERRORS.CONTENT_TYPE_CONFLICT)) }
  const analyze = vi
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValueOnce(conflict)
    .mockResolvedValueOnce({ ok: true, data: { contentType: 'campaign' } })
  vi.stubGlobal('window', { scnexus: { content: { analyze } } })
  const input = reactive({ kind: 'directory' as const, path: 'D:\\Source' })
  expect(await apiContentAnalyze(input)).toEqual(conflict)
  expect(isProxy(analyze.mock.calls[0]![0])).toBe(false)
  expect(await apiContentAnalyze(input, 'metadata-txt')).toEqual({
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
  expect(await request(async () => response)).toEqual(response)
  expect(
    await request(async () => ({ ok: true, data: {}, warnings: [{ code: 'M062' }] }) as never),
  ).toMatchObject({ ok: false, error: { code: 'R001' } })
})
