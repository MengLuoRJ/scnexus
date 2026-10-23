import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { join } from 'node:path'

let directory: string | undefined

function statIfPresent(path: string) {
  try {
    return lstatSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

function copyDirectory(source: string, target: string): void {
  const stat = lstatSync(source)
  if (stat.isSymbolicLink()) throw new Error('Application data migration rejects symbolic links')
  if (stat.isDirectory()) {
    mkdirSync(target, { mode: 0o700 })
    for (const name of readdirSync(source)) copyDirectory(join(source, name), join(target, name))
  } else if (stat.isFile()) {
    copyFileSync(source, target)
    chmodSync(target, 0o600)
  } else {
    throw new Error('Unsupported application data entry')
  }
}

/** Only app-owned data moves; Electron's userData and encryption key remain unchanged. */
export function prepareApplicationData(home: string, legacyUserData: string): string {
  const target = join(home, '.scnexus')
  const stat = statIfPresent(target)
  if (stat) {
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('Application data root must be a regular directory')
    return target
  }
  const staging = mkdtempSync(join(home, '.scnexus-migration-'))
  try {
    chmodSync(staging, 0o700)
    for (const name of ['SCNexusStorage', 'auth', 'analytics']) {
      const source = join(legacyUserData, name)
      const sourceStat = statIfPresent(source)
      if (!sourceStat) continue
      if (sourceStat.isSymbolicLink())
        throw new Error('Application data migration rejects symbolic links')
      if (!sourceStat.isDirectory()) throw new Error('Legacy application data must be a directory')
      copyDirectory(source, join(staging, name))
    }
    renameSync(staging, target)
    return target
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

export function initializeApplicationData(home: string, legacyUserData: string): void {
  directory ??= prepareApplicationData(home, legacyUserData)
}

export function getApplicationDataDirectory(): string {
  if (!directory) throw new Error('Application data has not been initialized')
  return directory
}
