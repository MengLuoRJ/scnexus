import { beforeEach, expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { ShellBridgeApi } from '@scnexus/app-shared/types/shell.type'

const mocks = vi.hoisted(() => ({
  expose: vi.fn<(name: string, api: unknown) => void>(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  send: vi.fn<(...args: unknown[]) => void>(),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, send: mocks.send },
}))
import '../ipc/shell'
const apis = Object.fromEntries(mocks.expose.mock.calls) as unknown as ShellBridgeApi
beforeEach(() => {
  mocks.invoke.mockReset()
})

test('exposes only the four explicit shell operations, not a generic shell', () => {
  expect(Object.keys(apis).sort()).toEqual([
    'shell:open-external-download',
    'shell:open-external-website',
    'shell:open-path',
    'shell:show-item-in-folder',
  ])
})

test('download forwards only its dedicated channel and preserves success and failure envelopes', async () => {
  const url = 'https://example.test/file.zip?token=abc'
  const success = { ok: true, data: undefined }
  mocks.invoke.mockResolvedValueOnce(success)
  expect(await apis['shell:open-external-download'](url)).toBe(success)
  expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('shell:open-external-download', url)
  const failure = { ok: false, error: toErrorDto(new AppError(ERRORS.IPC_INVALID_ARGUMENT)) }
  mocks.invoke.mockResolvedValueOnce(failure)
  expect(await apis['shell:open-external-download'](url)).toBe(failure)
})

test('download converts malformed replies and transport failures to standard errors', async () => {
  mocks.invoke.mockResolvedValueOnce({ ok: true })
  expect(await apis['shell:open-external-download']('https://example.test')).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_RESULT_INVALID.code },
  })
  mocks.invoke.mockRejectedValueOnce(new Error('disconnected'))
  expect(await apis['shell:open-external-download']('https://example.test')).toMatchObject({
    ok: false,
    error: { code: ERRORS.IPC_TRANSPORT_FAILED.code },
  })
})
