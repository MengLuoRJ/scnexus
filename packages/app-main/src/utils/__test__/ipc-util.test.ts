import { expect, test, vi } from 'vitest'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
const mock = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>(),
  source: vi.fn<() => void>(),
  report: vi.fn<() => void>(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (name: string) => mock.handlers.delete(name),
    handle: (name: string, fn: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      mock.handlers.set(name, fn),
  },
}))
vi.mock('../ipc-source', () => ({ assertIpcSource: mock.source }))
vi.mock('../../modules/logging/logging', () => ({
  reportError: mock.report,
  writeLog: vi.fn<() => void>(),
}))
vi.mock('../../modules/scii-game-setting/scii-game-setting', () => ({
  getGamePaths: vi.fn<() => void>(),
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

test('warnings are isolated across concurrent requests and returned exactly once', async () => {
  const { reportOperationWarning } = await import('../operation-warnings')
  const warning = new AppError(ERRORS.CONTENT_CLEANUP_WARNING)
  let release!: () => void
  const waiting = new Promise<void>((resolve) => {
    release = resolve
  })
  ipcHandle('slow:test', async () => {
    reportOperationWarning(warning)
    reportOperationWarning(warning)
    await waiting
    return 'slow'
  })
  ipcHandle('fast:test', () => 'fast')
  const slow = mock.handlers.get('slow:test')!({})
  expect(await mock.handlers.get('fast:test')!({})).toEqual({ ok: true, data: 'fast' })
  release()
  expect(await slow).toMatchObject({
    ok: true,
    data: 'slow',
    warnings: [{ errorId: warning.errorId }],
  })
  expect(((await slow) as { warnings: unknown[] }).warnings).toHaveLength(1)
  expect(await mock.handlers.get('fast:test')!({})).toEqual({ ok: true, data: 'fast' })
})

test('logging failures and secondary warnings cannot replace the original failure DTO', async () => {
  const { reportOperationWarning } = await import('../operation-warnings')
  const original = new AppError(ERRORS.CAMPAIGN_RECOVERY_FAILED, { message: 'rollback incomplete' })
  mock.report.mockImplementationOnce(() => {
    throw new Error('log unavailable')
  })
  ipcHandle('failure:test', () => {
    reportOperationWarning(new AppError(ERRORS.CONTENT_CLEANUP_WARNING))
    throw original
  })
  const result = await mock.handlers.get('failure:test')!({})
  expect(result).toMatchObject({ ok: false, error: { errorId: original.errorId, code: 'M043' } })
  expect(result).not.toHaveProperty('warnings')
})

test('late callbacks cannot mutate a returned warning envelope', async () => {
  const { reportOperationWarning } = await import('../operation-warnings')
  let release!: () => void
  let late!: Promise<void>
  ipcHandle('late:test', async () => {
    reportOperationWarning(new AppError(ERRORS.ARCHIVE_WARNING))
    late = new Promise<void>((resolve) => {
      release = resolve
    }).then(() => {
      reportOperationWarning(new AppError(ERRORS.CONTENT_CLEANUP_WARNING))
    })
    return 'committed'
  })
  const result = (await mock.handlers.get('late:test')!({})) as { warnings: unknown[] }
  expect(result.warnings).toHaveLength(1)
  release()
  await late
  expect(result.warnings).toHaveLength(1)
})
