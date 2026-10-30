import { app } from 'electron'
import * as Sentry from '@sentry/electron/main'
import { AppError, ERRORS, type AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { TelemetryStatus } from '@scnexus/app-shared/types/desktop.type'
import { redact } from '../logging/redact'
import { getMainWindow } from '../window/window'

let status: TelemetryStatus = { savedEnabled: false, state: 'disabled' }
let canSend = false
let session = 0
let initialized = false
let initializationFailed = false
let boundClientId: string | undefined
const pending = new Map<string, { session: number; event: Sentry.ErrorEvent }>()
export function setSavedTelemetryEnabled(enabled: boolean) {
  status.savedEnabled = enabled
  publish()
}
export function getTelemetryStatus(): TelemetryStatus {
  return { ...status }
}
function publish() {
  getMainWindow()?.webContents.send('telemetry:status', getTelemetryStatus())
}

export function enableTelemetry(clientId: string) {
  status = { savedEnabled: true, state: 'starting' }
  publish()
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!app.isPackaged || !dsn) {
    status.state = 'failed'
    publish()
    throw new AppError(ERRORS.TELEMETRY_INITIALIZATION_FAILED, {
      message: 'Telemetry is unavailable in this environment',
    })
  }
  if (canSend) {
    status.state = 'enabled'
    publish()
    return
  }
  try {
    if (initializationFailed) throw new Error('Telemetry initialization requires restart')
    if (!initialized) {
      initializationFailed = true
      Sentry.init({
        dsn,
        defaultIntegrations: false,
        dataCollection: { userInfo: false },
        sendClientReports: false,
        maxBreadcrumbs: 0,
        transport(options) {
          const transport = Sentry.makeElectronTransport(options)
          return {
            send(envelope) {
              if (!canSend) return Promise.resolve({})
              const allowed =
                envelope[1].length > 0 &&
                envelope[1].every(([header, value]) => {
                  if (
                    header.type !== 'event' ||
                    !value ||
                    typeof value !== 'object' ||
                    !('event_id' in value)
                  )
                    return false
                  const entry = pending.get(String(value.event_id))
                  return entry?.session === session
                })
              if (!allowed) return Promise.resolve({})
              for (const [, value] of envelope[1]) {
                if (value && typeof value === 'object' && 'event_id' in value)
                  pending.delete(String(value.event_id))
              }
              return transport.send(envelope)
            },
            flush(timeout) {
              return canSend ? transport.flush(timeout) : Promise.resolve(true)
            },
          }
        },
        beforeSend(event) {
          const entry = event.event_id ? pending.get(event.event_id) : undefined
          if (!canSend || entry?.session !== session) return null
          return {
            ...entry.event,
            timestamp: event.timestamp,
            release: event.release,
            environment: event.environment,
            user: boundClientId ? { id: boundClientId } : undefined,
          }
        },
      })
      initialized = true
      initializationFailed = false
    }
    session++
    boundClientId = clientId
    Sentry.setUser({ id: clientId })
    canSend = true
    status.state = 'enabled'
    publish()
  } catch (cause) {
    canSend = false
    boundClientId = undefined
    pending.clear()
    session++
    status.state = 'failed'
    publish()
    throw new AppError(ERRORS.TELEMETRY_INITIALIZATION_FAILED, {}, { cause })
  }
}

export async function disableTelemetry(savedEnabled = false) {
  canSend = false
  session++
  boundClientId = undefined
  pending.clear()
  status = { savedEnabled, state: 'disabled' }
  publish()
  try {
    Sentry.setUser(null)
  } catch (cause) {
    throw new AppError(ERRORS.TELEMETRY_DISABLE_FAILED, {}, { cause })
  }
}
export async function flushTelemetry(timeout = 2000): Promise<boolean> {
  if (!canSend || !initialized) return true
  const budget = Math.max(1, Math.min(timeout, 5000))
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Sentry.flush(budget),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), budget)
      }),
    ])
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
const reportedIds = new Set<string>()
export function reportTelemetry(
  error: {
    code: string
    name: string
    errorId: string
    message?: string
    taskId?: string
    stack?: string
    cause?: unknown
  },
  scope = 'main',
  process: 'main' | 'renderer' | 'preload' = 'main',
) {
  if (!canSend || reportedIds.has(error.errorId)) return
  reportedIds.add(error.errorId)
  if (reportedIds.size > 1000) reportedIds.delete(reportedIds.values().next().value!)
  const values: Sentry.Exception[] = []
  let current: { name: string; message?: string; stack?: string; cause?: unknown } | undefined =
    error
  const seen = new Set<unknown>()
  while (current && values.length < 4 && !seen.has(current)) {
    seen.add(current)
    const frames = current.stack
      ? Sentry.defaultStackParser(redact(current.stack).slice(0, 8192))
          .slice(-40)
          .map((frame) => ({
            filename: frame.filename ? redact(frame.filename).split(/[?#]/)[0] : undefined,
            function: frame.function ? redact(frame.function).slice(0, 200) : undefined,
            lineno: frame.lineno,
            colno: frame.colno,
            in_app: frame.in_app,
          }))
      : []
    values.unshift({
      type: redact(current.name).slice(0, 150),
      value: redact(current.message || current.name).slice(0, 2000),
      ...(frames.length ? { stacktrace: { frames } } : {}),
    })
    current = current.cause instanceof Error ? current.cause : undefined
  }
  const eventId = globalThis.crypto.randomUUID().replaceAll('-', '')
  const event: Sentry.ErrorEvent = {
    type: undefined,
    event_id: eventId,
    level: 'error',
    platform: 'javascript',
    exception: { values },
    tags: {
      code: redact(error.code).slice(0, 100),
      errorName: redact(error.name).slice(0, 150),
      errorId: redact(error.errorId).slice(0, 100),
      scope: redact(scope).slice(0, 100),
      process,
    },
  }
  pending.set(eventId, { session, event })
  if (pending.size > 1000) pending.delete(pending.keys().next().value!)
  Sentry.captureEvent(event)
}
export function reportRendererError(
  error: AppErrorDto,
  stack?: string,
  scope = 'renderer',
  process: 'renderer' | 'preload' = 'renderer',
) {
  reportTelemetry({ ...error, stack }, scope, process)
}
