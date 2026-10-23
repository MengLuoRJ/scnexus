import { afterEach, expect, test } from 'vitest'
import { chmod, mkdir, mkdtemp, rm, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { discoverMacGame, macGameExecutables, macGameRoot, macResourceRoot } from '../mac-game'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const home = await mkdtemp(join(process.cwd(), '.mac-game-test-'))
  roots.push(home)
  const root = join(home, 'External Game 中文')
  await mkdir(root)
  async function executable(path: string) {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, 'fixture-not-executed')
    await chmod(path, 0o755)
  }
  return { home, root, executable }
}
test('normalizes app selections and chooses highest runnable version, not lexical order or stale ExecuteInfo', async () => {
  const { home, root, executable } = await fixture()
  const old = join(root, 'Versions', 'Base9', 'SC2.app', 'Contents', 'MacOS', 'SC2')
  const latest = join(root, 'Versions', 'Base10', 'SC2.app', 'Contents', 'MacOS', 'SC2')
  await executable(old)
  await executable(latest)
  await mkdir(join(root, 'Versions', 'Base999', 'SC2.app'), { recursive: true })
  await executable(join(root, 'SC2.app', 'Contents', 'MacOS', 'SC2'))
  expect(await macGameRoot(join(root, 'SC2.app'))).toBe(root)
  expect(await macGameRoot(join(root, 'Versions', 'Base9', 'SC2.app'))).toBe(root)
  expect((await macGameExecutables(root)).client).toBe(latest)
  const data = join(home, 'Library', 'Application Support', 'Blizzard', 'StarCraft II')
  await mkdir(data, { recursive: true })
  await writeFile(join(data, 'ExecuteInfo.txt'), `executable = "${old.replaceAll('\\', '/')}"`)
  expect(await discoverMacGame(home)).toBe(root)
})
test('Battle.net record is bounded and validated, absent optional tools are not advertised', async () => {
  const { home, root, executable } = await fixture()
  await executable(join(root, 'SC2.app', 'Contents', 'MacOS', 'SC2'))
  const config = join(home, 'Library', 'Application Support', 'Battle.net')
  await mkdir(config, { recursive: true })
  await writeFile(
    join(config, 'Battle.net.config'),
    JSON.stringify({ Client: { Install: { Default: { s2: { InstallPath: root } } } } }),
  )
  expect(await discoverMacGame(home)).toBe(root)
  expect(await macGameExecutables(root)).toMatchObject({ switcher: '', editor: '' })
  await writeFile(join(config, 'Battle.net.config'), '{invalid')
  // No full disk scan and no command execution are used for discovery.
  expect(await macGameRoot(root)).toBe(root)
})
test('app markers must be directories, not files', async () => {
  const { root } = await fixture()
  await writeFile(join(root, 'SC2.app'), 'fake marker')
  await expect(macGameRoot(root)).rejects.toThrow('Invalid macOS game root')
})

test('resource roots preserve existing directory casing and default to Maps/Mods when absent', async () => {
  const { root } = await fixture()
  expect(await macResourceRoot(root, 'Maps')).toBe(join(root, 'Maps'))
  expect(await macResourceRoot(root, 'Mods')).toBe(join(root, 'Mods'))
  await mkdir(join(root, 'maps'))
  await mkdir(join(root, 'Mods'))
  expect(await macResourceRoot(root, 'Maps')).toBe(join(root, 'maps'))
  expect(await macResourceRoot(root, 'Mods')).toBe(join(root, 'Mods'))
  expect((await readdir(root)).sort()).toEqual(['Mods', 'maps'].sort())
})
test('resource root files and symbolic links are rejected instead of writing outside the game', async () => {
  const { root } = await fixture()
  await writeFile(join(root, 'maps'), 'not a directory')
  await expect(macResourceRoot(root, 'Maps')).rejects.toThrow('regular directory')
})
