import { expect, test, vi } from 'vitest'
import { createApp } from 'vue'
import { captureException, getClient } from '@sentry/electron/renderer'
import type { TelemetryStatus } from '@scnexus/app-shared/types/desktop.type'
const mocks = vi.hoisted(() => ({
  status: undefined as ((status: TelemetryStatus) => void) | undefined,
  get: vi.fn<typeof import('../../ipcs/telemetry').ipcTelemetryGetStatus>(),
  stop: vi.fn<() => void>(),
  write: vi.fn<typeof import('../../ipcs/logging').ipcLoggingWrite>(),
}))
vi.mock('../../ipcs/telemetry', () => ({
  ipcTelemetryGetStatus: mocks.get,
  ipcTelemetryOnStatus: (listener: (status: TelemetryStatus) => void) => {
    mocks.status = listener
    return mocks.stop
  },
}))
vi.mock('../../ipcs/logging', () => ({ ipcLoggingWrite: mocks.write }))
import { installRendererTelemetry } from '../renderer-telemetry'
import { installErrorReporting } from '../error-reporting'

test('official Vue SDK emits one envelope while IPC logs stay local and consent gates delayed errors', async () => {
  vi.stubGlobal('scnexus', {})
  const send = vi.fn<(body: string | Uint8Array) => void>()
  vi.stubGlobal('__SENTRY_IPC__', {
    'sentry-ipc': {
      sendEnvelope: send,
      sendRendererStart: vi.fn<() => void>(),
    },
  })
  let resolve!: (result: Awaited<ReturnType<typeof mocks.get>>) => void
  mocks.get.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const app = createApp({})
  const telemetry = installRendererTelemetry(app)
  const stopLogging = installErrorReporting(app, window, telemetry.recordError)
  try {
    expect(getClient()).toBeUndefined()
    mocks.status!({ savedEnabled: true, state: 'enabled', sessionId: 'consent-one' })
    const client = getClient()!
    expect(client).toBeDefined()
    expect(client.getIntegrationByName('Vue')).toBeDefined()
    resolve({ ok: true, data: { savedEnabled: false, state: 'disabled' } })
    await Promise.resolve()
    app.config.errorHandler!(new Error('synthetic Vue failure'), null, 'render')
    expect(mocks.write).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce())
    const body = String(send.mock.calls[0]![0])
    expect(body).toContain('synthetic Vue failure')
    expect(body).toContain('consent-one')
    expect(body).not.toContain('contexts')
    mocks.status!({ savedEnabled: false, state: 'disabled' })
    const disabledError = new Error('disabled synthetic')
    app.config.errorHandler!(disabledError, null, 'render')
    mocks.status!({ savedEnabled: true, state: 'enabled', sessionId: 'consent-two' })
    expect(getClient()).toBe(client)
    await new Promise<void>((done) => setTimeout(done, 10))
    await client.flush(100)
    expect(send).toHaveBeenCalledOnce()
    const delayed = new Error('old synthetic')
    telemetry.recordError(delayed)
    mocks.status!({ savedEnabled: false, state: 'disabled' })
    mocks.status!({ savedEnabled: true, state: 'enabled', sessionId: 'consent-three' })
    captureException(delayed)
    await client.flush(100)
    expect(send).toHaveBeenCalledOnce()
    app.config.errorHandler!(new Error('new synthetic'), null, 'render')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(mocks.write).toHaveBeenCalledTimes(3)
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('window synthetic') }))
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(3))
    const rejection = new Event('unhandledrejection')
    Object.defineProperty(rejection, 'reason', { value: new Error('promise synthetic') })
    window.dispatchEvent(rejection)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(4))
    expect(mocks.write).toHaveBeenCalledTimes(5)
    telemetry.dispose()
    stopLogging()
    captureException(new Error('after disposal'))
    await client.flush(100)
    expect(send).toHaveBeenCalledTimes(4)
    expect(mocks.stop).toHaveBeenCalledOnce()
  } finally {
    telemetry.dispose()
    stopLogging()
    await getClient()?.close(100)
    vi.unstubAllGlobals()
  }
})
