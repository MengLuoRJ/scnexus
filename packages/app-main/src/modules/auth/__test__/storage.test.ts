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
    isAsyncEncryptionAvailable: vi.fn<() => Promise<boolean>>(async () => true),
    getSelectedStorageBackend: vi.fn<() => string>(() => 'gnome_libsecret'),
    encryptStringAsync: vi.fn<(value: string) => Promise<Buffer>>(async () =>
      Buffer.from('encrypted-ciphertext'),
    ),
    decryptStringAsync: vi.fn<(value: Buffer) => Promise<{ result: string }>>(async () => ({
      result: token,
    })),
  }
  return {
    directory,
    token,
    encryption,
    storage: createAuthStorage(directory, encryption, platform),
  }
}
describe('safeStorage persistence', () => {
  it('stores only ciphertext atomically and loads through async decryption', async () => {
    const { storage, directory, token } = setup()
    await expect(storage.load()).resolves.toBeNull()
    await storage.save(token, () => {})
    const ciphertext = readFileSync(join(directory, 'refresh.enc'), 'utf8')
    expect(ciphertext).toBe('encrypted-ciphertext')
    expect(ciphertext).not.toContain(token)
    await expect(storage.load()).resolves.toBe(token)
    expect(
      process.platform === 'win32' ? 0o600 : statSync(join(directory, 'refresh.enc')).mode & 0o777,
    ).toBe(0o600)
    storage.clear()
    storage.clear()
    await expect(storage.load()).resolves.toBeNull()
  })
  it('rejects Linux basic_text and unknown backends', async () => {
    const { storage, encryption, token, directory } = setup('linux')
    for (const backend of ['basic_text', 'unknown']) {
      encryption.getSelectedStorageBackend.mockReturnValue(backend)
      await expect(storage.save(token, () => {})).rejects.toThrow('Account operation failed')
      await expect(storage.load()).rejects.toThrow('Account operation failed')
    }
    expect(existsSync(directory)).toBe(false)
    expect(encryption.encryptStringAsync).not.toHaveBeenCalled()
  })
  it('fails closed when OS encryption is unavailable or encryption fails', async () => {
    const { storage, encryption, token, directory } = setup()
    encryption.isAsyncEncryptionAvailable.mockResolvedValue(false)
    await expect(storage.save(token, () => {})).rejects.toThrow('Account operation failed')
    encryption.isAsyncEncryptionAvailable.mockResolvedValue(true)
    encryption.encryptStringAsync.mockRejectedValue(new Error('sensitive'))
    await expect(storage.save(token, () => {})).rejects.toThrow('Account operation failed')
    expect(existsSync(directory)).toBe(false)
  })
  it('reads existing ciphertext with the async result object and rejects corrupt credentials', async () => {
    const { storage, encryption, directory, token } = setup()
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'refresh.enc'), 'legacy-cipher', { mode: 0o600 })
    await expect(storage.load()).resolves.toBe(token)
    expect(encryption.decryptStringAsync).toHaveBeenCalledWith(Buffer.from('legacy-cipher'))
    encryption.decryptStringAsync.mockRejectedValueOnce(new Error('corrupt'))
    await expect(storage.load()).rejects.toThrow('Account operation failed')
    encryption.decryptStringAsync.mockResolvedValue({ result: 'not-a-refresh' })
    await expect(storage.load()).rejects.toThrow('Account operation failed')
  })
  it('does not resurrect a cleared credential after encryption completes', async () => {
    const { storage, encryption, token, directory } = setup()
    let complete!: (ciphertext: Buffer) => void
    encryption.encryptStringAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = storage.save(token, () => {})
    await vi.waitFor(() => expect(encryption.encryptStringAsync).toHaveBeenCalledOnce())
    storage.clear()
    complete(Buffer.from('cipher'))
    await expect(pending).rejects.toThrow('Account operation failed')
    expect(existsSync(directory)).toBe(false)
  })
  it('does not overwrite a newer save when encryption resolves out of order', async () => {
    const { storage, encryption, token, directory } = setup()
    let complete!: (ciphertext: Buffer) => void
    encryption.encryptStringAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const old = storage.save(token, () => {})
    await vi.waitFor(() => expect(encryption.encryptStringAsync).toHaveBeenCalledOnce())
    await storage.save('b'.repeat(43), () => {})
    complete(Buffer.from('stale'))
    await expect(old).rejects.toThrow('Account operation failed')
    expect(readFileSync(join(directory, 'refresh.enc'), 'utf8')).toBe('encrypted-ciphertext')
  })
  it('rejects decryption that completes after credentials are cleared', async () => {
    const { storage, encryption, token } = setup()
    await storage.save(token, () => {})
    let complete!: (value: { result: string }) => void
    encryption.decryptStringAsync.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = storage.load()
    await vi.waitFor(() => expect(encryption.decryptStringAsync).toHaveBeenCalledOnce())
    storage.clear()
    complete({ result: token })
    await expect(pending).rejects.toThrow('Account operation failed')
  })
  it('checks the session guard after encryption and before touching disk', async () => {
    const { storage, token, directory } = setup()
    await expect(
      storage.save(token, () => {
        throw new Error('stale')
      }),
    ).rejects.toThrow('Account operation failed')
    expect(existsSync(directory)).toBe(false)
  })
})
