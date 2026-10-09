import { test, expect, vi } from 'vitest'
const register = vi.hoisted(() => vi.fn())
vi.mock('../../../utils/ipc-util', () => ({
  ipcHandle: register,
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
  },
}))
vi.mock('../client-launcher', () => ({
  runGameClient: vi.fn(),
  runGameExecutable: vi.fn(),
  runEditorExecutable: vi.fn(),
}))
import { initCustomizeIpc } from '../customize.ipc'
test('customize registers install/uninstall and launch, never activation', () => {
  initCustomizeIpc()
  const names = register.mock.calls.map((call) => call[0])
  for (const channel of [
    'customize:analyze',
    'customize:install',
    'customize:prepare-uninstall',
    'customize:uninstall',
    'customize:run-game-client',
  ])
    expect(names).toContain(channel)
  expect(names.some((name) => name.includes('activate'))).toBe(false)
})
