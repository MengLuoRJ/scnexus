import { expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

const mocks = vi.hoisted(() => ({
  expose: vi.fn<(name: string, api: DesktopApi) => void>(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(channel: string, callback: (...args: unknown[]) => void) => void>(),
  removeListener: vi.fn<(channel: string, callback: (...args: unknown[]) => void) => void>(),
  send: vi.fn<(...args: unknown[]) => void>(),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
    send: mocks.send,
  },
}))
import '../ipc/desktop'

test.each(['campaign', 'customize'] as const)(
  '%s progress subscription strips the Electron event and removes exactly its listener',
  (domain) => {
    mocks.removeListener.mockClear()
    const api = mocks.expose.mock.calls.find(([name]) => name === 'scnexus')![1] as DesktopApi
    const listener =
      vi.fn<(progress: import('@scnexus/app-shared/types/content.type').InstallProgress) => void>()
    const stop = api[domain].onInstallProgress(listener)
    const [channel, callback] = mocks.on.mock.calls.at(-1)!
    expect(channel).toBe(`${domain}:install-progress`)
    const progress = {
      taskId: 'task',
      analysisId: 'analysis',
      stage: 'copying',
      completedFiles: 1,
      totalFiles: 2,
      currentFile: 'Mods/Core.SC2Mod',
    }
    callback({ sender: 'must not leak' }, progress)
    expect(listener).toHaveBeenCalledExactlyOnceWith(progress)
    stop()
    expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(channel, callback)
  },
)

test.each(['campaign', 'customize'] as const)(
  '%s install forwards the optional client task ID unchanged',
  async (domain) => {
    const api = mocks.expose.mock.calls.find(([name]) => name === 'scnexus')![1] as DesktopApi
    const selection = {
      analysisId: 'analysis',
      taskId: 'task',
      mode: 'auto' as const,
      decisions: [],
    }
    mocks.invoke.mockResolvedValueOnce({ ok: true, data: {} })
    await api[domain].install(selection)
    expect(mocks.invoke).toHaveBeenCalledWith(`${domain}:install`, selection)
  },
)

test.each(['campaign', 'customize'] as const)(
  '%s preserves committed success with warnings and rejects malformed warning data',
  async (domain) => {
    const api = mocks.expose.mock.calls.find(([name]) => name === 'scnexus')![1] as DesktopApi
    const warning = toErrorDto(
      new AppError(ERRORS.CONTENT_CLEANUP_WARNING, { message: 'Temporary file occupied' }),
    )
    const response = { ok: true, data: { localId: 'record' }, warnings: [warning] }
    mocks.invoke.mockResolvedValueOnce(response)
    expect(await api[domain].list()).toEqual(response)
    mocks.invoke.mockResolvedValueOnce({ ok: true, data: {}, warnings: [{ code: 'M062' }] })
    expect(await api[domain].list()).toMatchObject({ ok: false, error: { code: 'R001' } })
  },
)

test('transport rejection still produces P001 when forwarding a log also fails', async () => {
  const api = mocks.expose.mock.calls.find(([name]) => name === 'scnexus')![1] as DesktopApi
  mocks.invoke.mockRejectedValueOnce(new Error('IPC disconnected'))
  mocks.send.mockImplementationOnce(() => {
    throw new Error('Destroyed webContents')
  })
  expect(await api.campaign.list()).toMatchObject({ ok: false, error: { code: 'P001' } })
})
