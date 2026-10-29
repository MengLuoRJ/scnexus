import { afterEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  enabled: false,
  register: vi.fn<(channel: string, handler: (...args: unknown[]) => Promise<unknown>) => void>(),
  remove: vi.fn<(channel: string) => void>(),
  stop: vi.fn<() => Promise<unknown>>(async () => ({ state: 'stopped', port: 17861 })),
  dispose: vi.fn<() => Promise<void>>(async () => {}),
  start: vi.fn<(port: number) => Promise<unknown>>(async (port) => ({ state: 'running', port })),
}))
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
vi.mock('../../../stores/setting', () => ({
  settingRepository: {
    getSnapshot: () => ({ aiAssistantEnabled: mocks.enabled, aiAssistantPort: 17861 }),
  },
}))
vi.mock('../../../utils/ipc-util', () => ({
  ipcHandleRegister: mocks.register,
  ipcHandleRemove: mocks.remove,
}))
vi.mock('../../../utils/ipc-source', () => ({ assertIpcSource: () => {} }))
vi.mock('../local-data', () => ({}))
vi.mock('../tools', () => ({ createReadOnlyAiAssistantTools: () => [] }))
vi.mock('../service', () => ({
  createAiAssistantService: () => ({
    start: mocks.start,
    stop: mocks.stop,
    dispose: mocks.dispose,
    getStatus: () => ({ state: 'stopped', port: 17861 }),
    regenerateToken: () => ({ url: 'http://127.0.0.1:17861/mcp', token: 'test-token' }),
    getConnectionInfo: () => ({ url: 'http://127.0.0.1:17861/mcp', token: 'test-token' }),
    listRecords: () => [],
    clearRecords: () => ({}),
  }),
}))
import { initAiAssistantModule, disposeAiAssistant, setAiAssistantEnabled } from '../index'
afterEach(async () => {
  await disposeAiAssistant()
  vi.clearAllMocks()
})
test('initialization registers only explicit controls without starting the listener', async () => {
  initAiAssistantModule()
  initAiAssistantModule()
  expect(mocks.register).toHaveBeenCalledTimes(7)
  expect(mocks.start).not.toHaveBeenCalled()
  const handler = mocks.register.mock.calls.find(
    ([channel]) => channel === 'ai-assistant:start',
  )![1]
  await expect(handler(80)).rejects.toMatchObject({ code: 'M003' })
  await expect(handler(17861, 'extra')).rejects.toMatchObject({ code: 'M003' })
  await handler(17861)
  expect(mocks.start).toHaveBeenCalledWith(17861)
  await setAiAssistantEnabled(false)
  expect(mocks.stop).toHaveBeenCalledOnce()
})
