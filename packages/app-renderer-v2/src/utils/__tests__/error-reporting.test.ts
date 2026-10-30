import { afterEach, expect, test, vi } from 'vitest'
import { createApp } from 'vue'
const write = vi.hoisted(() => vi.fn<typeof import('../../ipcs/logging').ipcLoggingWrite>())
vi.mock('../../ipcs/logging', () => ({ ipcLoggingWrite: write }))
import { installErrorReporting } from '../error-reporting'
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})
test('forwards Vue, window and Promise errors once with bounded stacks and cleans up', () => {
  vi.stubGlobal('scnexus', {})
  const app = createApp({})
  const previous = vi.fn<NonNullable<import('vue').App['config']['errorHandler']>>()
  app.config.errorHandler = previous
  const dispose = installErrorReporting(app)
  try {
    const error = new Error('synthetic renderer failure')
    app.config.errorHandler!(error, null, '')
    window.dispatchEvent(new ErrorEvent('error', { error }))
    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenLastCalledWith(
      expect.objectContaining({ scope: 'vue', errorStack: error.stack }),
    )
    const event = new Event('unhandledrejection')
    Object.defineProperty(event, 'reason', { value: new Error('rejection') })
    window.dispatchEvent(event)
    expect(write).toHaveBeenCalledTimes(2)
    const large = new Error('a'.repeat(10000))
    large.stack = 'b'.repeat(10000)
    window.dispatchEvent(new ErrorEvent('error', { error: large }))
    expect(write.mock.lastCall![0].errorStack).toHaveLength(6000)
    expect(write.mock.lastCall![0].error!.message).toHaveLength(2000)
  } finally {
    dispose()
  }
  expect(app.config.errorHandler).toBe(previous)
  const calls = write.mock.calls.length
  window.dispatchEvent(new ErrorEvent('error', { message: 'after disposal' }))
  expect(write).toHaveBeenCalledTimes(calls)
})
test('a missing or broken bridge does not cause another renderer exception', () => {
  const app = createApp({})
  const dispose = installErrorReporting(app)
  try {
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('browser only') }))
    expect(write).not.toHaveBeenCalled()
    vi.stubGlobal('scnexus', {})
    write.mockImplementationOnce(() => {
      throw new Error('closed bridge')
    })
    expect(() => app.config.errorHandler!(new Error('failure'), null, '')).not.toThrow()
  } finally {
    dispose()
  }
})
test('automatic capture is limited to twenty errors per minute', () => {
  vi.stubGlobal('scnexus', {})
  vi.useFakeTimers()
  const app = createApp({})
  const dispose = installErrorReporting(app)
  try {
    for (let index = 0; index < 25; index++) {
      app.config.errorHandler!(new Error(`synthetic ${index}`), null, '')
    }
    expect(write).toHaveBeenCalledTimes(20)
    vi.advanceTimersByTime(60000)
    app.config.errorHandler!(new Error('next minute'), null, '')
    expect(write).toHaveBeenCalledTimes(21)
  } finally {
    dispose()
    vi.useRealTimers()
  }
})
