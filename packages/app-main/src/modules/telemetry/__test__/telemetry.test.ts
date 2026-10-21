import { test, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  init: vi.fn<typeof import('@sentry/electron/main').init>(),
  capture: vi.fn<typeof import('@sentry/electron/main').captureMessage>(),
  send: vi.fn<ReturnType<typeof import('@sentry/electron/main').makeElectronTransport>['send']>(
    async () => ({}),
  ),
  close: vi.fn<(timeout?: number) => Promise<boolean>>(async () => true),
  user: vi.fn<typeof import('@sentry/electron/main').setUser>(),
}))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('@sentry/electron/main', () => ({
  init: mocks.init,
  captureMessage: mocks.capture,
  setUser: mocks.user,
  getClient: () => ({ close: mocks.close }),
  makeElectronTransport: () => ({ send: mocks.send, flush: async () => true }),
}))
vi.mock('../../window/window', () => ({ getMainWindow: () => null }))
vi.mock('../../logging/logging', () => ({ redact: (value: string) => value }))
import * as service from '../telemetry'
test('consent gates transport and reports, deduplicates errors and blocks old sessions after disabling', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
  service.reportTelemetry({ code: 'M002', name: 'error', errorId: 'before' })
  expect(mocks.capture).not.toHaveBeenCalled()
  service.enableTelemetry('client')
  const options = mocks.init.mock.calls[0][0]!
  const transport = options.transport!({
    url: 'https://example.invalid/api/1/envelope/',
    recordDroppedEvent: () => {},
  })
  await transport.send([{}, []])
  expect(mocks.send).toHaveBeenCalledOnce()
  const error = { code: 'M002', name: 'error', errorId: 'same' }
  service.reportTelemetry(error)
  service.reportTelemetry(error)
  expect(mocks.capture).toHaveBeenCalledOnce()
  await service.disableTelemetry()
  await transport.send([{}, []])
  service.reportTelemetry({ ...error, errorId: 'after' })
  expect(mocks.send).toHaveBeenCalledOnce()
  expect(mocks.capture).toHaveBeenCalledOnce()
  expect(options.beforeSend!({ type: undefined }, {})).toBeNull()
  expect(mocks.close).toHaveBeenCalledOnce()
  vi.unstubAllEnvs()
})
