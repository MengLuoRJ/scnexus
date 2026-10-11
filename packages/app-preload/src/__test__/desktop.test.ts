import { expect, test, vi } from 'vitest'
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
