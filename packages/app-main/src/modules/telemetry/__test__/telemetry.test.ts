import { test, expect, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  init: vi.fn<typeof import('@sentry/electron/main').init>(),
  capture: vi.fn<typeof import('@sentry/electron/main').captureEvent>(),
  send: vi.fn<ReturnType<typeof import('@sentry/electron/main').makeElectronTransport>['send']>(
    async () => ({}),
  ),
  close: vi.fn<(timeout?: number) => Promise<boolean>>(async () => true),
  user: vi.fn<typeof import('@sentry/electron/main').setUser>(),
  flush: vi.fn<(timeout?: number) => Promise<boolean>>(async () => true),
}))
vi.mock('electron', () => ({ app: { isPackaged: true } }))
vi.mock('@sentry/electron/main', () => ({
  init: mocks.init,
  captureEvent: mocks.capture,
  flush: mocks.flush,
  defaultStackParser: (stack: string) => [{ filename: stack, function: 'synthetic', lineno: 12 }],
  setUser: mocks.user,
  getClient: () => ({ close: mocks.close }),
  makeElectronTransport: () => ({ send: mocks.send, flush: async () => true }),
}))
vi.mock('../../window/window', () => ({ getMainWindow: () => null }))
import * as service from '../telemetry'
test('consent gates transport and reports, deduplicates errors and blocks old sessions after disabling', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
  service.reportTelemetry({ code: 'M002', name: 'error', errorId: 'before' })
  expect(mocks.capture).not.toHaveBeenCalled()
  service.enableTelemetry('client')
  const options = mocks.init.mock.calls[0][0]!
  const transport = options.transport!({
    url: 'https://example.invalid/api/1/envelope/',
    recordDroppedEvent: () => { },
  })
  const error = { code: 'M002', name: 'error', errorId: 'same' }
  service.reportTelemetry(error)
  service.reportTelemetry(error)
  expect(mocks.capture).toHaveBeenCalledOnce()
  const captured = mocks.capture.mock.calls[0][0]!
  const clean = await options.beforeSend!(
    { ...captured, extra: { secret: 'do not send' }, request: { url: 'secret' } },
    {},
  )
  expect(clean).not.toHaveProperty('extra')
  expect(clean).not.toHaveProperty('request')
  await transport.send([{}, [[{ type: 'event' }, clean!]]])
  expect(mocks.send).toHaveBeenCalledOnce()
  service.reportTelemetry({ ...error, errorId: 'late' })
  const late = mocks.capture.mock.calls[1][0]!
  await service.flushTelemetry()
  expect(mocks.flush).toHaveBeenCalledWith(2000)
  await service.disableTelemetry()
  await transport.send([{}, [[{ type: 'event' }, late]]])
  service.reportTelemetry({ ...error, errorId: 'after' })
  expect(mocks.send).toHaveBeenCalledOnce()
  expect(mocks.capture).toHaveBeenCalledTimes(2)
  expect(options.beforeSend!({ type: undefined }, {})).toBeNull()
  expect(mocks.close).not.toHaveBeenCalled()
  service.enableTelemetry('client')
  expect(mocks.init).toHaveBeenCalledOnce()
  expect(options.beforeSend!(late, {})).toBeNull()
  await transport.send([{}, [[{ type: 'event' }, late]]])
  expect(mocks.send).toHaveBeenCalledOnce()
  service.reportTelemetry({
    ...error,
    errorId: 'fresh',
    message: 'recoveryCodes=["synthetic"]',
    stack: 'C:\\Users\\SyntheticUser\\app.js',
  })
  const fresh = mocks.capture.mock.calls[2][0]!
  expect(JSON.stringify(fresh)).not.toContain('SyntheticUser')
  expect(fresh.exception?.values?.[0]?.value).toBe('recoveryCodes=[redacted]')
  await transport.send([{}, [[{ type: 'event' }, fresh]]])
  expect(mocks.send).toHaveBeenCalledTimes(2)
  await transport.send([{}, [[{ type: 'attachment' }, new Uint8Array([1])]]])
  expect(mocks.send).toHaveBeenCalledTimes(2)
  await service.disableTelemetry()
  vi.unstubAllEnvs()
})
test('flush is bounded and revoking consent prevents any subsequent draining', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
  vi.useFakeTimers()
  try {
    service.enableTelemetry('client')
    mocks.flush.mockImplementationOnce(() => new Promise(() => { }))
    const flushing = service.flushTelemetry(50)
    await vi.advanceTimersByTimeAsync(50)
    await expect(flushing).resolves.toBe(false)
    await service.disableTelemetry()
    const calls = mocks.flush.mock.calls.length
    await expect(service.flushTelemetry()).resolves.toBe(true)
    expect(mocks.flush).toHaveBeenCalledTimes(calls)
  } finally {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  }
})
test('cause chains and tags are sanitized without mutating the original errors', async () => {
  vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
  try {
    service.enableTelemetry('client')
    const cause = new Error('contact synthetic@example.invalid')
    const input = {
      code: 'M002',
      name: 'password=synthetic-secret',
      errorId: 'cause-test',
      message: 'outer',
      cause,
    }
    service.reportTelemetry(input, 'tokenless')
    const captured = mocks.capture.mock.calls.at(-1)![0]!
    expect(captured.exception?.values).toHaveLength(2)
    expect(captured.exception?.values?.[0]?.value).toBe('contact [email]')
    expect(captured.exception?.values?.[1]?.value).toBe('outer')
    expect(captured.tags?.errorName).toBe('password=[redacted]')
    expect(cause.message).toBe('contact synthetic@example.invalid')
    await service.disableTelemetry()
  } finally {
    vi.unstubAllEnvs()
  }
})
test('partial SDK initialization failure requires restart instead of registering IPC twice', async () => {
  vi.resetModules()
  const isolated = await import('../telemetry')
  vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
  const calls = mocks.init.mock.calls.length
  mocks.init.mockImplementationOnce(() => {
    throw new Error('partial initialization')
  })
  try {
    expect(() => isolated.enableTelemetry('client')).toThrow('')
    expect(isolated.getTelemetryStatus()).toEqual({ savedEnabled: true, state: 'failed' })
    expect(() => isolated.enableTelemetry('client')).toThrow('')
    expect(mocks.init).toHaveBeenCalledTimes(calls + 1)
    await isolated.disableTelemetry()
    expect(isolated.getTelemetryStatus()).toEqual({ savedEnabled: false, state: 'disabled' })
  } finally {
    vi.unstubAllEnvs()
  }
})
test('official renderer errors require current consent and are sanitized before transport', async () => {
  vi.resetModules()
  const service = await import('../telemetry')
  vi.stubEnv('VITE_SENTRY_DSN', 'https://example.invalid/1')
  try {
    service.enableTelemetry('client')
    const options = mocks.init.mock.calls[0][0]!
    const sessionId = service.getTelemetryStatus().sessionId!
    const event = {
      type: undefined,
      event_id: 'official-renderer-event',
      exception: {
        values: [
          {
            type: 'Error',
            value: 'password=synthetic-secret',
            stacktrace: {
              frames: [{ filename: 'C:\\Users\\SyntheticUser\\app.js?secret=1', lineno: 10 }],
            },
          },
        ],
      },
      tags: { scnexusConsent: sessionId, 'event.process': 'renderer' },
      extra: { password: 'secret' },
      contexts: { vue: { props: 'private' } },
      request: { url: 'secret' },
    }
    const clean = await options.beforeSend!(event, {})
    expect(clean?.tags).toEqual({ process: 'renderer' })
    expect(clean?.exception?.values?.[0]?.value).toBe('password=[redacted]')
    expect(JSON.stringify(clean)).not.toContain('SyntheticUser')
    expect(clean).not.toHaveProperty('extra')
    expect(clean).not.toHaveProperty('contexts')
    expect(clean).not.toHaveProperty('request')
    const transport = options.transport!({
      url: 'https://example.invalid/envelope',
      recordDroppedEvent: () => { },
    })
    const calls = mocks.send.mock.calls.length
    await transport.send([{}, [[{ type: 'event' }, clean!]]])
    expect(mocks.send).toHaveBeenCalledTimes(calls + 1)
    await service.disableTelemetry()
    expect(options.beforeSend!(event, {})).toBeNull()
    service.enableTelemetry('client')
    expect(service.getTelemetryStatus().sessionId).not.toBe(sessionId)
    expect(options.beforeSend!(event, {})).toBeNull()
    await service.disableTelemetry()
  } finally {
    vi.unstubAllEnvs()
  }
})
