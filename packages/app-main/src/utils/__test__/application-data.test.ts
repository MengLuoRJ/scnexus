import { afterEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { prepareApplicationData } from '../application-data'

const roots: string[] = []
function setup() {
  const root = mkdtempSync(join(process.cwd(), '.application-data-test-'))
  roots.push(root)
  const home = join(root, 'home')
  const legacy = join(root, 'legacy')
  mkdirSync(home)
  mkdirSync(legacy)
  function write(path: string, value: string) {
    const file = join(legacy, path)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, value)
  }
  return { root, home, legacy, write }
}
afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }))
})

describe('application-owned data directory', () => {
  it('migrates only owned directories and preserves the complete old data', () => {
    const { home, legacy, write } = setup()
    write('SCNexusStorage/store-setting.json', '{"version":3}')
    write('SCNexusStorage/nested/backup.bak', 'backup')
    write('auth/refresh.enc', 'ciphertext')
    write('analytics/visitor.json', 'visitor')
    write('Local State', 'electron encryption keys')
    write('Local Storage/file', 'browser')
    write('logs/main.log', 'logs')
    const target = prepareApplicationData(home, legacy)
    expect(target).toBe(join(home, '.scnexus'))
    expect(readdirSync(target).sort()).toEqual(['SCNexusStorage', 'analytics', 'auth'])
    for (const path of [
      'SCNexusStorage/store-setting.json',
      'SCNexusStorage/nested/backup.bak',
      'auth/refresh.enc',
      'analytics/visitor.json',
    ]) {
      expect(readFileSync(join(target, path))).toEqual(readFileSync(join(legacy, path)))
    }
    expect(readFileSync(join(legacy, 'Local State'), 'utf8')).toBe('electron encryption keys')
    expect(readdirSync(home)).toEqual(['.scnexus'])
  })
  it('creates a clean root for new users', () => {
    const { home, legacy } = setup()
    rmSync(legacy, { recursive: true })
    expect(readdirSync(prepareApplicationData(home, legacy))).toEqual([])
  })
  it('uses an existing target without merging or resurrecting deleted old credentials', () => {
    const { home, legacy, write } = setup()
    write('SCNexusStorage/store-setting.json', 'old')
    write('auth/refresh.enc', 'old-credential')
    const target = prepareApplicationData(home, legacy)
    writeFileSync(join(target, 'SCNexusStorage/store-setting.json'), 'new')
    rmSync(join(target, 'auth'), { recursive: true })
    expect(prepareApplicationData(home, legacy)).toBe(target)
    expect(readFileSync(join(target, 'SCNexusStorage/store-setting.json'), 'utf8')).toBe('new')
    expect(existsSync(join(target, 'auth'))).toBe(false)
  })
  it('rejects a non-directory target without modifying it', () => {
    const { home, legacy } = setup()
    writeFileSync(join(home, '.scnexus'), 'existing')
    expect(() => prepareApplicationData(home, legacy)).toThrow('regular directory')
    expect(readFileSync(join(home, '.scnexus'), 'utf8')).toBe('existing')
  })
  it('rejects links, removes staging on failure, and allows a later migration retry', () => {
    const { home, legacy, write, root } = setup()
    write('SCNexusStorage/store-setting.json', 'settings')
    const outside = join(root, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'private'), 'outside')
    symlinkSync(outside, join(legacy, 'auth'), process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => prepareApplicationData(home, legacy)).toThrow('symbolic links')
    expect(readdirSync(home)).toEqual([])
    expect(readFileSync(join(outside, 'private'), 'utf8')).toBe('outside')
    rmSync(join(legacy, 'auth'))
    expect(existsSync(prepareApplicationData(home, legacy))).toBe(true)
  })
})
