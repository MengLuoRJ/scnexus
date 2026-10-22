import { mkdirSync, readFileSync, renameSync, writeFileSync, lstatSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

export interface VisitorCredential {
  visitorToken: string
  expiresAt: string
}
export interface AnalyticsStorage {
  load(): VisitorCredential | null
  save(credential: VisitorCredential): void
  clear(): void
}
export function isVisitorCredential(value: unknown): value is VisitorCredential {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    typeof data.visitorToken === 'string' &&
    data.visitorToken.length > 0 &&
    data.visitorToken.length <= 8192 &&
    typeof data.expiresAt === 'string' &&
    Number.isFinite(Date.parse(data.expiresAt))
  )
}

/** Main-only installation credential; deliberately separate from auth/refresh storage. */
export function createAnalyticsStorage(directory: string): AnalyticsStorage {
  const path = join(directory, 'analytics-visitor.json')
  return {
    load() {
      try {
        const stat = lstatSync(path)
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384)
          throw new Error('Invalid analytics storage')
        const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
        if (
          !data ||
          typeof data !== 'object' ||
          (data as Record<string, unknown>).version !== 1 ||
          !isVisitorCredential(data)
        )
          throw new Error('Invalid analytics storage')
        return { visitorToken: data.visitorToken, expiresAt: data.expiresAt }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw new Error('Analytics storage unavailable')
      }
    },
    clear() {
      try {
        unlinkSync(path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new Error('Analytics storage unavailable')
      }
    },
    save(credential) {
      const staging = `${path}.${randomUUID()}.pending`
      try {
        if (!isVisitorCredential(credential)) throw new Error()
        mkdirSync(directory, { recursive: true, mode: 0o700 })
        const stat = lstatSync(directory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error()
        writeFileSync(staging, JSON.stringify({ version: 1, ...credential }), {
          mode: 0o600,
          flag: 'wx',
        })
        renameSync(staging, path)
      } catch {
        throw new Error('Analytics storage unavailable')
      } finally {
        try {
          unlinkSync(staging)
        } catch {
          /* No temporary file remains after successful rename. */
        }
      }
    },
  }
}
