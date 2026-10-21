import { test, expect, vi } from 'vitest'
const register = vi.hoisted(() => vi.fn<typeof import('../../../utils/ipc-util').ipcHandle>())
vi.mock('../../../utils/ipc-util', () => ({
  ipcHandle: register,
}))
vi.mock('../../content-package', () => ({
  contentService: {
    analyze: vi.fn<typeof contentService.analyze>(),
    install: vi.fn<typeof contentService.install>(),
    scan: vi.fn<typeof contentService.scan>(),
    list: vi.fn<typeof contentService.list>(),
    prepareRemoval: vi.fn<typeof contentService.prepareRemoval>(),
    remove: vi.fn<typeof contentService.remove>(),
    prepareActivation: vi.fn<typeof contentService.prepareActivation>(),
    activate: vi.fn<typeof contentService.activate>(),
    getActive: vi.fn<typeof contentService.getActive>(),
  },
}))
import { initCampaignIpc } from '../campaign.ipc'
import { contentService } from '../../content-package'
import type { InstallProgress, InstallSelection } from '@scnexus/app-shared/types/content.type'
test('campaign registers analysis, import, activation and removal as distinct IPC operations', () => {
  initCampaignIpc()
  const names = register.mock.calls.map((call) => call[0])
  for (const channel of [
    'campaign:launch',
    'campaign:analyze',
    'campaign:install',
    'campaign:prepare-activation',
    'campaign:activate',
    'campaign:prepare-deactivation',
    'campaign:deactivate',
    'campaign:prepare-uninstall',
    'campaign:uninstall',
  ])
    expect(names).toContain(channel)
})

test('install progress is sent only to its initiating renderer, never to destroyed senders', async () => {
  const selection: InstallSelection = {
    analysisId: 'analysis',
    taskId: 'task',
    mode: 'ccm',
    decisions: [],
  }
  const progress: InstallProgress = {
    taskId: 'task',
    analysisId: 'analysis',
    stage: 'copying',
    completedFiles: 1,
    totalFiles: 2,
    currentFile: 'Mods/Core.SC2Mod',
  }
  vi.mocked(contentService.install).mockImplementation(async (_selection, _type, report) => {
    report?.(progress)
    return { localId: 'installed' } as never
  })
  initCampaignIpc()
  const [, handler, passEvent] = register.mock.calls.find(
    ([channel]) => channel === 'campaign:install',
  )!
  expect(passEvent).toBe(true)
  const sender = {
    isDestroyed: vi.fn<() => boolean>(() => false),
    send: vi.fn<(channel: string, progress: InstallProgress) => void>(),
  }
  expect(await handler({ sender }, selection)).toEqual({ localId: 'installed' })
  expect(contentService.install).toHaveBeenCalledWith(selection, 'campaign', expect.any(Function))
  expect(sender.send).toHaveBeenCalledExactlyOnceWith('campaign:install-progress', progress)
  sender.isDestroyed.mockReturnValue(true)
  await handler({ sender }, selection)
  expect(sender.send).toHaveBeenCalledOnce()
})
