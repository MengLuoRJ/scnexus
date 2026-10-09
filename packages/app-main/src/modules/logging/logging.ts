import log from 'electron-log/main'
import { normalizeError, toErrorDto, type AppError } from '@scnexus/app-shared/errors/app.error'
import { LOG_LEVELS, type LogInput, type LogLevel } from '@scnexus/app-shared/types/desktop.type'

let level: LogLevel = 'error'
let reportTelemetry: ((error: AppError) => void) | undefined
const reported = new Set<string>()

import { redact } from './redact'
export { redact } from './redact'

function printable(value: unknown): string {
  if (value instanceof Error) return redact(`${value.name}: ${value.message}`)
  if (typeof value === 'string') return redact(value)
  try {
    return redact(JSON.stringify(value) ?? String(value))
  } catch {
    return '[unserializable]'
  }
}

export function applyLogLevel(next: LogLevel): void {
  if (!LOG_LEVELS.includes(next)) throw new TypeError('Invalid log level')
  log.transports.console.level = next
  log.transports.file.level = next
  level = next
}

export function getLogConfig() {
  return { level }
}
export function setTelemetryReporter(reporter?: (error: AppError) => void) {
  reportTelemetry = reporter
}

export function writeLog(input: LogInput, process: 'main' | 'preload' | 'renderer' = 'main') {
  if (LOG_LEVELS.indexOf(input.level) > LOG_LEVELS.indexOf(level)) return
  try {
    const error = input.error
      ? {
          ...input.error,
          ...(input.error.message ? { message: redact(input.error.message) } : {}),
        }
      : undefined
    log[input.level](
      `[${process}] [${redact(input.scope)}] ${redact(input.message)}`,
      error ? JSON.stringify(error) : '',
      input.taskId ? `taskId=${redact(input.taskId)}` : '',
    )
  } catch {
    globalThis.process.stderr.write('SCNexus logging transport unavailable\n')
  }
}

export const Logger = Object.fromEntries(
  LOG_LEVELS.map((name) => [
    name,
    (...args: unknown[]) => {
      writeLog({
        level: name,
        scope: 'legacy',
        message: args.map(printable).join(' '),
      })
    },
  ]),
) as Record<LogLevel, (...args: unknown[]) => void>

export function reportError(value: unknown, scope: string): AppError {
  const error = normalizeError(value)
  if (reported.has(error.errorId)) return error
  reported.add(error.errorId)
  if (reported.size > 1000) reported.delete(reported.values().next().value!)
  const dto = toErrorDto(error)
  writeLog({
    level: 'error',
    scope,
    message: `${error.code} ${error.name}`,
    error: { ...dto, ...(dto.message ? { message: redact(dto.message) } : {}) },
    taskId: dto.taskId,
  })
  try {
    reportTelemetry?.(error)
  } catch {
    /* A failed remote reporter must not recurse through logging. */
  }
  return error
}

export function initializeLogging() {
  log.transports.console.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}'
  log.transports.file.format = '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}'
  log.transports.file.maxSize = 5 * 1024 * 1024
  applyLogLevel('error')
}
