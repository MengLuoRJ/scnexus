import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createAuthStorage } from '../storage'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function setup(platform: NodeJS.Platform = process.platform) {
  const directory = join(
    process.cwd(),
    'src',
    'modules',
    'auth',
    '__test__',
    `.storage-${randomUUID()}`,
  )
  directories.push(directory)
  const token = 'a'.repeat(43)
  const encryption = {
    isEncryptionAvailable: vi.fn<() => boolean>(() => true),
    getSelectedStorageBackend: vi.fn<() => string>(() => 'gnome_libsecret'),
    encryptString: vi.fn<(value: string) => Buffer>(() => Buffer.from('encrypted-ciphertext')),
    decryptString: vi.fn<(value: Buffer) => string>(() => token),
  }
  return {
    directory,
    token,
    encryption,
    storage: createAuthStorage(directory, encryption, platform),
  }
}
describe('safeStorage persistence', () => {
  it('stores only ciphertext atomically and loads through decryption', () => {
    const { storage, directory, token } = setup()
    expect(storage.load()).toBeNull()
    storage.save(token)
    const ciphertext = readFileSync(join(directory, 'refresh.enc'), 'utf8')
    expect(ciphertext).toBe('encrypted-ciphertext')
    expect(ciphertext).not.toContain(token)
    expect(storage.load()).toBe(token)
    expect(
      process.platform === 'win32' ? 0o600 : statSync(join(directory, 'refresh.enc')).mode & 0o777,
    ).toBe(0o600)
    storage.clear()
    storage.clear()
    expect(storage.load()).toBeNull()
  })
  it('rejects Linux basic_text and unknown backends', () => {
    const { storage, encryption, token, directory } = setup('linux')
    for (const backend of ['basic_text', 'unknown']) {
      encryption.getSelectedStorageBackend.mockReturnValue(backend)
      expect(() => storage.save(token)).toThrow('Account operation failed')
      expect(() => storage.load()).toThrow('Account operation failed')
    }
    expect(existsSync(directory)).toBe(false)
    expect(encryption.encryptString).not.toHaveBeenCalled()
  })
  it('fails closed when OS encryption is unavailable or encryption fails', () => {
    const { storage, encryption, token, directory } = setup()
    encryption.isEncryptionAvailable.mockReturnValue(false)
    expect(() => storage.save(token)).toThrow(/Invalid account input|Account operation failed/)
    encryption.isEncryptionAvailable.mockReturnValue(true)
    encryption.encryptString.mockImplementation(() => {
      throw new Error('sensitive')
    })
    expect(() => storage.save(token)).toThrow('Account operation failed')
    expect(existsSync(directory)).toBe(false)
  })
  it('rejects corrupt ciphertext and invalid decrypted credentials', () => {
    const { storage, encryption, directory } = setup()
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'refresh.enc'), 'cipher', { mode: 0o600 })
    encryption.decryptString.mockImplementationOnce(() => {
      throw new Error('corrupt')
    })
    expect(() => storage.load()).toThrow('Account operation failed')
    encryption.decryptString.mockReturnValue('not-a-refresh')
    expect(() => storage.load()).toThrow(/Invalid account input|Account operation failed/)
  })
})
