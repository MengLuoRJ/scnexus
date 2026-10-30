import { expect, test, vi } from 'vitest'
import type { IpcMainInvokeEvent } from 'electron'
const mocks = vi.hoisted(() => ({
  register:
    vi.fn<
      (channel: string, handler: (...args: unknown[]) => unknown, passEvent?: boolean) => void
    >(),
  update: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  key: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
}))
vi.mock('../../../utils/ipc-util', () => ({ ipcHandle: mocks.register }))
vi.mock('../setting', () => ({
  getSettingSnapshot: () => ({}),
  getSettingKey: () => null,
  updateSetting: mocks.update,
  updateSettingKey: mocks.key,
}))
import { initSettingIpc } from '../setting.ipc'
test('all settings write routes forward trusted invocation source to native grant validation', async () => {
  initSettingIpc()
  const event = { sender: { id: 42 } } as IpcMainInvokeEvent
  const patch = { aiAutoApproveUninstallCampaign: true }
  for (const channel of ['setting:update', 'setting:replace']) {
    const entry = mocks.register.mock.calls.find(([name]) => name === channel)!
    expect(entry[2]).toBe(true)
    await entry[1](event, patch)
    expect(mocks.update).toHaveBeenLastCalledWith(patch, channel === 'setting:replace', event)
  }
  for (const channel of ['setting:update-key', 'setting:set-setting-key']) {
    const entry = mocks.register.mock.calls.find(([name]) => name === channel)!
    expect(entry[2]).toBe(true)
    await entry[1](event, 'aiAutoApproveUninstallCampaign', true)
    expect(mocks.key).toHaveBeenLastCalledWith('aiAutoApproveUninstallCampaign', true, event)
  }
})
