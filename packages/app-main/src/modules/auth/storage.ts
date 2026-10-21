import {
  chmodSync,
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { failure, refreshSecret } from './validation'

export interface AuthStorage {
  load(): string | null
  save(refreshToken: string): void
  clear(): void
}
export interface SecretEncryption {
  isEncryptionAvailable(): boolean
  getSelectedStorageBackend(): string
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

/** Synchronous commits keep epoch checks and credential replacement indivisible in main. */
export function createAuthStorage(
  directory: string,
  encryption: SecretEncryption,
  platform = process.platform,
): AuthStorage {
  const path = join(directory, 'refresh.enc')
  function supported() {
    if (
      !encryption.isEncryptionAvailable() ||
      (platform === 'linux' &&
        !['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(
          encryption.getSelectedStorageBackend(),
        ))
    )
      throw failure()
  }
  function remove(file: string) {
    try {
      unlinkSync(file)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw failure()
    }
  }
  return {
    load() {
      try {
        supported()
        let stat
        try {
          stat = lstatSync(path)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
          throw failure()
        }
        if (
          !stat.isFile() ||
          stat.isSymbolicLink() ||
          stat.size > 65536 ||
          stat.size === 0 ||
          (platform !== 'win32' && (stat.mode & 0o077) !== 0)
        )
          throw failure()
        const token = encryption.decryptString(readFileSync(path))
        if (!refreshSecret(token)) throw failure()
        return token
      } catch {
        throw failure()
      }
    },
    save(token) {
      let staging: string | undefined
      try {
        supported()
        if (!refreshSecret(token)) throw failure()
        const ciphertext = encryption.encryptString(token)
        if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) throw failure()
        mkdirSync(directory, { recursive: true, mode: 0o700 })
        const stat = lstatSync(directory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure()
        chmodSync(directory, 0o700)
        staging = join(directory, `refresh.${randomUUID()}.enc`)
        const fd = openSync(staging, 'wx', 0o600)
        try {
          writeFileSync(fd, ciphertext)
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        renameSync(staging, path)
        staging = undefined
      } catch {
        throw failure()
      } finally {
        if (staging) remove(staging)
      }
    },
    clear() {
      remove(path)
    },
  }
}
