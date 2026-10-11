import { app } from 'electron'
import sevenZipBin from '7z-bin'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { access } from 'node:fs/promises'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { notifyOperation, reportOperationWarning } from '../operation-warnings'
import {
  createSevenZipError,
  SevenZipError,
  SevenZipPathError,
  SevenZipTimeoutError,
} from './errors'
import type { SevenZipCommonOptions, SevenZipEntry, SevenZipResult } from './types'

export class SevenZipRunner {
  readonly binaryPath: string

  constructor(binaryPath = resolveBundledBinaryPath()) {
    this.binaryPath = binaryPath
  }

  spawn(args: string[], options: SevenZipCommonOptions = {}): ChildProcessWithoutNullStreams {
    try {
      return spawn(this.binaryPath, args, {
        cwd: options.cwd,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        signal: options.signal,
      })
    } catch (error) {
      throw new SevenZipError(`Failed to start 7-Zip: ${(error as Error).message}`)
    }
  }

  run(args: string[], options: SevenZipCommonOptions = {}): Promise<SevenZipResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(args, options)
      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      const stdoutProgress = progressReader(options.onProgress)
      const stderrProgress = progressReader(options.onProgress)
      let timedOut = false
      let settled = false
      let processError: Error | undefined
      const stop = () => {
        try {
          child.kill()
        } catch (error) {
          processError ??= error as Error
        }
      }
      const timeout = options.timeout
        ? setTimeout(() => {
            timedOut = true
            stop()
          }, options.timeout)
        : undefined

      child.stdout.on('data', (chunk: Buffer) => {
        stdout.push(chunk)
        stdoutProgress.write(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr.push(chunk)
        stderrProgress.write(chunk)
      })
      const recordError = (error: Error) => {
        processError ??= error
        stop()
      }
      child.stdout.on('error', recordError)
      child.stderr.on('error', recordError)
      child.on('error', (error) => {
        processError ??= error
      })
      child.on('close', (exitCode) => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        stdoutProgress.end()
        stderrProgress.end()
        const result: SevenZipResult = {
          command: this.binaryPath,
          args: [...args],
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
        }

        if (timedOut) {
          reject(new SevenZipTimeoutError(options.timeout ?? 0, result))
        } else if (processError) {
          reject(new SevenZipError(`7-Zip process failed: ${processError.message}`, result))
        } else if (result.exitCode === 0 || result.exitCode === 1) {
          if (result.exitCode === 1) reportSevenZipWarning(result, options)
          resolve(result)
        } else {
          reject(createSevenZipError(result))
        }
      })
    })
  }
}

export function resolveBundledBinaryPath(): string {
  const binaryPath = sevenZipBin.path7z
  return app.isPackaged || process.env.NODE_ENV === 'production'
    ? binaryPath.replace('app.asar', 'app.asar.unpacked')
    : binaryPath
}

export async function assertPathExists(path: string): Promise<void> {
  try {
    await access(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new SevenZipPathError(path)
    throw error
  }
}

export function reportSevenZipWarning(result: SevenZipResult, options: SevenZipCommonOptions = {}) {
  if (options.onWarning) notifyOperation(() => options.onWarning!(result))
  else
    reportOperationWarning(
      new AppError(
        ERRORS.ARCHIVE_WARNING,
        {
          message: '7-Zip completed with warnings',
        },
        { cause: createSevenZipError(result) },
      ),
    )
}

export function parseTechnicalList(output: string, archive: string): SevenZipEntry[] {
  const entries: SevenZipEntry[] = []
  for (const block of output.split(/\r?\n\r?\n/)) {
    const properties = Object.fromEntries(
      block
        .split(/\r?\n/)
        .map((line) => line.match(/^([^=]+?) = (.*)$/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => [match[1].trim(), match[2]]),
    )
    const path = properties.Path
    if (!path || path === archive || properties.Type) continue
    entries.push({
      path,
      size: parseOptionalNumber(properties.Size),
      packedSize: parseOptionalNumber(properties['Packed Size']),
      modified: parseOptionalDate(properties.Modified),
      attributes: properties.Attributes,
      crc: properties.CRC,
      method: properties.Method,
      isDirectory: properties.Folder === '+' || properties.Attributes?.startsWith('D') === true,
      properties,
    })
  }
  return entries
}

function progressReader(callback?: SevenZipCommonOptions['onProgress']) {
  const decoder = new StringDecoder('utf8')
  let pending = ''
  return {
    write(chunk: Buffer) {
      if (!callback) return
      const lines = (pending + decoder.write(chunk)).split(/[\r\n\b]+/)
      pending = lines.pop() ?? ''
      for (const line of lines) parseProgress(line, callback)
    },
    end() {
      if (callback) parseProgress(pending + decoder.end(), callback)
    },
  }
}

function parseProgress(output: string, callback?: SevenZipCommonOptions['onProgress']) {
  if (!callback) return
  for (const line of output.split(/[\r\n\b]+/)) {
    const match = line.match(/^\s*(\d{1,3})%(?:\s+(.*))?$/)
    if (match && Number(match[1]) <= 100)
      notifyOperation(() => callback({ percent: Number(match[1]), file: match[2]?.trim() }))
  }
}

function parseOptionalNumber(value?: string): number | undefined {
  if (value === undefined || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value.replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}
