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
  load(): Promise<string | null>
  save(refreshToken: string, beforeCommit: () => void): Promise<void>
  clear(): void
}
export interface SecretEncryption {
  isAsyncEncryptionAvailable(): Promise<boolean>
  getSelectedStorageBackend(): string
  encryptStringAsync(value: string): Promise<Buffer>
  decryptStringAsync(value: Buffer): Promise<{ result: string }>
}

/** Encryption yields; the guarded file commit remains indivisible in main. */
export function createAuthStorage(
  directory: string,
  encryption: SecretEncryption,
  platform = process.platform,
): AuthStorage {
  const path = join(directory, 'refresh.enc')
  let revision = 0
  async function supported() {
    if (
      !(await encryption.isAsyncEncryptionAvailable()) ||
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
    async load() {
      const version = revision
      try {
        await supported()
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
        const { result: token } = await encryption.decryptStringAsync(readFileSync(path))
        if (version !== revision || !refreshSecret(token)) throw failure()
        return token
      } catch {
        throw failure()
      }
    },
    async save(token, beforeCommit) {
      const version = ++revision
      let staging: string | undefined
      try {
        await supported()
        if (!refreshSecret(token)) throw failure()
        const ciphertext = await encryption.encryptStringAsync(token)
        if (!Buffer.isBuffer(ciphertext) || ciphertext.length === 0) throw failure()
        if (version !== revision) throw failure()
        beforeCommit()
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
      revision++
      remove(path)
    },
  }
}
