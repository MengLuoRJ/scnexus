import { expect, test, vi } from 'vitest'
import { AppError, ERRORS, toErrorDto } from '@scnexus/app-shared/errors/app.error'
const mocks = vi.hoisted(() => ({
  listener: undefined as ((event: unknown, value: unknown, source: unknown) => void) | undefined,
  write: vi.fn<typeof import('../logging').writeLog>(),
  report: vi.fn<(...args: unknown[]) => void>(),
  source: vi.fn<() => void>(),
}))
vi.mock('electron', () => ({
  ipcMain: {
    removeAllListeners: () => {},
    on: (_channel: string, listener: typeof mocks.listener) => {
      mocks.listener = listener
    },
  },
}))
vi.mock('../../../utils/ipc-source', () => ({ assertIpcSource: mocks.source }))
vi.mock('../../../utils/ipc-util', () => ({ ipcHandle: () => {} }))
vi.mock('../logging', () => ({ getLogConfig: () => ({ level: 'error' }), writeLog: mocks.write }))
vi.mock('../../setting/setting', () => ({ updateSetting: () => {} }))
vi.mock('../../telemetry/telemetry', () => ({
  reportTelemetry: mocks.report,
  reportRendererError: mocks.report,
}))
import { initLoggingIpc } from '../logging.ipc'

test('renderer error forwarding writes only local logs and never reports telemetry', () => {
  initLoggingIpc()
  const value = {
    level: 'error',
    scope: 'vue',
    message: 'synthetic failure',
    error: toErrorDto(new AppError(ERRORS.APP_UNEXPECTED_ERROR)),
    errorStack: 'synthetic stack',
  }
  mocks.listener!({}, value, 'renderer')
  expect(mocks.write).toHaveBeenCalledExactlyOnceWith(value, 'renderer')
  expect(mocks.report).not.toHaveBeenCalled()
  mocks.listener!({}, { ...value, errorStack: 'x'.repeat(8193) }, 'renderer')
  expect(mocks.write).toHaveBeenCalledOnce()
  mocks.source.mockImplementationOnce(() => {
    throw new Error('untrusted source')
  })
  mocks.listener!({}, value, 'renderer')
  expect(mocks.write).toHaveBeenCalledOnce()
})
