import { expect, test, vi } from 'vitest'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>(),
  source: vi.fn(),
  report: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (name: string) => mock.handlers.delete(name),
    handle: (name: string, fn: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      mock.handlers.set(name, fn),
  },
}))
vi.mock('../ipc-source', () => ({ assertIpcSource: mock.source }))
vi.mock('../../modules/logging/logging', () => ({ reportError: mock.report }))
vi.mock('../../modules/scii-game-setting/scii-game-setting', () => ({
  getGamePaths: vi.fn(),
}))
import { ipcHandle, ipcHandleRegister } from '../ipc-util'
test('every handler returns the same result envelope and preserves error occurrence', async () => {
  ipcHandle('dialog:test', () => undefined)
  expect(await mock.handlers.get('dialog:test')!({})).toEqual({
    ok: true,
    data: undefined,
  })
  const error = new AppError(ERRORS.TASK_CONFLICT, {
    taskId: 'task',
    message: 'busy',
  })
  ipcHandleRegister('shell:test', () => {
    throw error
  })
  expect(await mock.handlers.get('shell:test')!({})).toMatchObject({
    ok: false,
    error: {
      code: 'M051',
      errorId: error.errorId,
      taskId: 'task',
      message: 'busy',
    },
  })
  ipcHandle('updater:test', () => 42)
  mock.source.mockImplementationOnce(() => {
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  })
  expect(await mock.handlers.get('updater:test')!({})).toMatchObject({
    ok: false,
    error: { code: 'M004' },
  })
})
