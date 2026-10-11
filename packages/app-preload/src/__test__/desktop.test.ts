import { expect, test, vi } from 'vitest'
import type { DesktopApi } from '@scnexus/app-shared/types/desktop.type'

const mocks = vi.hoisted(() => ({
  expose: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
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

test('campaign progress subscription strips the Electron event and removes exactly its listener', () => {
  const api = mocks.expose.mock.calls.find(([name]) => name === 'scnexus')![1] as DesktopApi
  const listener = vi.fn()
  const stop = api.campaign.onInstallProgress(listener)
  const [channel, callback] = mocks.on.mock.calls.at(-1)!
  expect(channel).toBe('campaign:install-progress')
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
})

test('campaign install forwards the optional client task ID unchanged', async () => {
  const api = mocks.expose.mock.calls.find(([name]) => name === 'scnexus')![1] as DesktopApi
  const selection = { analysisId: 'analysis', taskId: 'task', mode: 'ccm' as const, decisions: [] }
  mocks.invoke.mockResolvedValueOnce({ ok: true, data: {} })
  await api.campaign.install(selection)
  expect(mocks.invoke).toHaveBeenCalledWith('campaign:install', selection)
})
