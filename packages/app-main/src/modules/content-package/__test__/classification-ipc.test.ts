import { expect, test, vi } from 'vitest'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>(),
  analyze: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  validate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  source: vi.fn<() => void>(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    removeHandler: (name: string) => mocks.handlers.delete(name),
    handle: (name: string, handler: (event: unknown, ...args: unknown[]) => Promise<unknown>) =>
      mocks.handlers.set(name, handler),
  },
}))
vi.mock('../../../utils/ipc-source', () => ({ assertIpcSource: mocks.source }))
vi.mock('../../logging/logging', () => ({
  reportError: vi.fn<() => void>(),
  writeLog: vi.fn<() => void>(),
}))
vi.mock('../../scii-game-setting/scii-game-setting', () => ({ getGamePaths: vi.fn<() => void>() }))
vi.mock('../content-package', () => ({ contentService: { analyzeContent: mocks.analyze } }))
vi.mock('../validation', () => ({ validateArchive: mocks.validate }))
import { initContentPackageIpc } from '../content-package.ipc'
import { initArchiveValidationIpc } from '../validation.ipc'
initContentPackageIpc()
initArchiveValidationIpc()

test('read-only validation is independently registered and rejects untrusted IPC sources', async () => {
  const handler = mocks.handlers.get('content-package:validate-archive')!
  const input = { kind: 'archive', path: 'D:\\Source.zip' }
  mocks.validate.mockResolvedValueOnce({ descriptors: [] })
  expect(await handler({}, input)).toEqual({ ok: true, data: { descriptors: [] } })
  expect(mocks.validate).toHaveBeenCalledExactlyOnceWith(input)
  mocks.source.mockImplementationOnce(() => {
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  })
  expect(await handler({}, input)).toMatchObject({ ok: false, error: { code: 'M004' } })
  expect(mocks.validate).toHaveBeenCalledOnce()
})

test('controlled unified analysis returns classified success and conflict DTO without extra error fields', async () => {
  const handler = mocks.handlers.get('content-package:analyze')!
  const input = { kind: 'directory', path: 'D:\\Source' }
  mocks.analyze.mockResolvedValueOnce({ contentType: 'customize' })
  expect(await handler({}, input, 'package-json')).toEqual({
    ok: true,
    data: { contentType: 'customize' },
  })
  expect(mocks.analyze).toHaveBeenLastCalledWith(input, 'package-json')
  const error = new AppError(ERRORS.CONTENT_TYPE_CONFLICT)
  mocks.analyze.mockRejectedValueOnce(error)
  expect(await handler({}, input)).toMatchObject({
    ok: false,
    error: { code: 'M064', errorId: error.errorId },
  })
  mocks.source.mockImplementationOnce(() => {
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  })
  expect(await handler({}, input)).toMatchObject({ ok: false, error: { code: 'M004' } })
})
