import { test, expect, vi } from 'vitest'
const register = vi.hoisted(() => vi.fn<typeof import('../../../utils/ipc-util').ipcHandle>())
vi.mock('../../../utils/ipc-util', () => ({
  ipcHandle: register,
}))
vi.mock('../../content-package', () => ({
  contentService: {
    analyze: vi.fn<typeof import('../../content-package').contentService.analyze>(),
    install: vi.fn<typeof import('../../content-package').contentService.install>(),
    scan: vi.fn<typeof import('../../content-package').contentService.scan>(),
    list: vi.fn<typeof import('../../content-package').contentService.list>(),
    prepareRemoval: vi.fn<typeof import('../../content-package').contentService.prepareRemoval>(),
    remove: vi.fn<typeof import('../../content-package').contentService.remove>(),
  },
}))
vi.mock('../client-launcher', () => ({
  runGameClient: vi.fn<typeof import('../client-launcher').runGameClient>(),
  runGameExecutable: vi.fn<typeof import('../client-launcher').runGameExecutable>(),
  runEditorExecutable: vi.fn<typeof import('../client-launcher').runEditorExecutable>(),
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

test('customize progress is delivered only to the invoking live sender', async () => {
  const { contentService } = await import('../../content-package')
  const progress = {
    taskId: 'task',
    analysisId: 'analysis',
    stage: 'completed',
    completedFiles: 1,
    totalFiles: 1,
    currentFile: null,
  }
  vi.mocked(contentService.install).mockImplementationOnce(async (_selection, _type, report) => {
    report?.(progress as import('@scnexus/app-shared/types/content.type').InstallProgress)
    return {} as import('@scnexus/app-shared/types/content.type').ContentRecord
  })
  const registration = register.mock.calls.find(([channel]) => channel === 'customize:install')!
  expect(registration[2]).toBe(true)
  const sender = {
    isDestroyed: vi.fn<() => boolean>(() => false),
    send: vi.fn<(...args: unknown[]) => void>(),
  }
  const selection = { analysisId: 'analysis', taskId: 'task', mode: 'auto', decisions: [] }
  await registration[1]({ sender }, selection)
  expect(contentService.install).toHaveBeenCalledWith(selection, 'customize', expect.any(Function))
  expect(sender.send).toHaveBeenCalledExactlyOnceWith('customize:install-progress', progress)
  vi.mocked(contentService.install).mockImplementationOnce(async (_selection, _type, report) => {
    report?.(progress as import('@scnexus/app-shared/types/content.type').InstallProgress)
    return {} as import('@scnexus/app-shared/types/content.type').ContentRecord
  })
  sender.isDestroyed.mockReturnValue(true)
  sender.send.mockClear()
  await registration[1]({ sender }, selection)
  expect(sender.send).not.toHaveBeenCalled()
})
