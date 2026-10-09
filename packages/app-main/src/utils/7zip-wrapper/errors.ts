import type { SevenZipResult } from './types'

const EXIT_CODE_MESSAGES: Record<number, string> = {
  1: '7-Zip completed with warnings',
  2: '7-Zip reported a fatal error',
  7: '7-Zip command line error',
  8: '7-Zip ran out of memory',
  255: '7-Zip was stopped by the user',
}

export class SevenZipError extends Error {
  readonly result?: SevenZipResult

  constructor(message: string, result?: SevenZipResult) {
    super(message)
    this.name = 'SevenZipError'
    this.result = result
  }
}

export class SevenZipTimeoutError extends SevenZipError {
  readonly timeout: number

  constructor(timeout: number, result?: SevenZipResult) {
    super(`7-Zip timed out after ${timeout}ms`, result)
    this.name = 'SevenZipTimeoutError'
    this.timeout = timeout
  }
}

export class SevenZipPathError extends SevenZipError {
  readonly path: string

  constructor(path: string) {
    super(`Path does not exist: ${path}`)
    this.name = 'SevenZipPathError'
    this.path = path
  }
}

export function createSevenZipError(result: SevenZipResult): SevenZipError {
  const detail = result.stderr.trim() || result.stdout.trim()
  const message =
    detail || EXIT_CODE_MESSAGES[result.exitCode] || `7-Zip exited with code ${result.exitCode}`
  return new SevenZipError(message, result)
}
