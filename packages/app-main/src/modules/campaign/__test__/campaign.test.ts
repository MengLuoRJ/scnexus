import { test, expect, vi } from 'vitest'
const register = vi.hoisted(() => vi.fn())
vi.mock('../../../utils/ipc-util', () => ({
  ipcHandle: register,
}))
vi.mock('../../content-package', () => ({
  contentService: {
    analyze: vi.fn(),
    install: vi.fn(),
    scan: vi.fn(),
    list: vi.fn(),
    prepareRemoval: vi.fn(),
    remove: vi.fn(),
    prepareActivation: vi.fn(),
    activate: vi.fn(),
    getActive: vi.fn(),
  },
}))
import { initCampaignIpc } from '../campaign.ipc'
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
