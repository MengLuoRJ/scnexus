import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { gameAbsolutePath, gameLogicalPath, safeGamePath } from '../paths'
vi.mock('electron', () => ({ app: {} }))
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(process.cwd(), '.mapped-path-test-'))
  roots.push(root)
  const paths = {
    ...gamePaths(root, root),
    mapsRoot: join(root, 'maps'),
    modsRoot: join(root, 'mods'),
  }
  await mkdir(paths.mapsRoot)
  await mkdir(paths.modsRoot)
  return paths
}
test('maps only the physical resource root and preserves package path contracts', async () => {
  const paths = await fixture()
  expect(await safeGamePath(paths, 'Maps/Campaign/A.SC2Map')).toBe(
    join(paths.mapsRoot, 'Campaign', 'A.SC2Map'),
  )
  expect(gameAbsolutePath(paths, 'Mods/Sub/A.SC2Mod')).toBe(join(paths.modsRoot, 'Sub', 'A.SC2Mod'))
  expect(gameLogicalPath(paths, join(paths.mapsRoot, 'Campaign', 'A.SC2Map'))).toBe(
    'Maps/Campaign/A.SC2Map',
  )
  expect(gameAbsolutePath(paths, 'SCNexusCustomizeData/payload')).toBe(
    join(paths.gameRoot, 'SCNexusCustomizeData', 'payload'),
  )
  expect(() => gameAbsolutePath(paths, 'Maps/../outside')).toThrow(
    expect.objectContaining({ code: 'M031' }),
  )
})
test('mapped roots do not bypass directory containment or symlink rejection', async () => {
  const paths = await fixture()
  const outside = await mkdtemp(join(process.cwd(), '.mapped-outside-'))
  roots.push(outside)
  await writeFile(join(outside, 'private'), 'untouched')
  expect(() => gameAbsolutePath({ ...paths, mapsRoot: outside }, 'Maps/private')).toThrow(
    expect.objectContaining({ code: 'M031' }),
  )
  await symlink(
    outside,
    join(paths.mapsRoot, 'Link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  await expect(safeGamePath(paths, 'Maps/Link/private')).rejects.toMatchObject({ code: 'M031' })
})
