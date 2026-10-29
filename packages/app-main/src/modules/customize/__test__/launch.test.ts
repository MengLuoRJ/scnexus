import { afterEach, expect, test, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentRecord, ContentStore, GamePaths } from '@scnexus/app-shared/types/content.type'
const mocks = vi.hoisted(() => ({
  update: vi.fn<(value: ContentStore) => void>(),
  list: vi.fn<() => ContentStore>(),
  paths: vi.fn<() => Promise<GamePaths>>(),
  lock: vi.fn<<T>(run: () => Promise<T>) => Promise<T>>(async (run) => run()),
  run: vi.fn<(args: { run: string }) => Promise<void>>(),
}))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('../../../stores/customize', () => ({
  customizeRepository: { getSnapshot: mocks.list, update: mocks.update },
}))
vi.mock('../../content-package', () => ({ contentService: { list: mocks.list } }))
vi.mock('../../scii-game-setting', () => ({ getGamePaths: mocks.paths, withGameLock: mocks.lock }))
vi.mock('../client-launcher', () => ({ runGameExecutable: mocks.run }))
import { launch, setLauncher } from '../customize'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
const roots: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture(directory = false) {
  const root = await mkdtemp(join(process.cwd(), '.launcher-test-'))
  roots.push(root)
  const paths = {
    ...gamePaths(root, join(root, 'documents')),
    mapsRoot: join(root, 'maps'),
    modsRoot: join(root, 'mods'),
  }
  const target = 'Maps/Start.SC2Map'
  const absolute = join(paths.mapsRoot, 'Start.SC2Map')
  await mkdir(paths.mapsRoot)
  if (directory) {
    await mkdir(absolute)
    await writeFile(join(absolute, 'MapInfo'), 'map')
  } else await writeFile(absolute, 'map')
  const file = {
    source: target,
    target: directory ? target + '/MapInfo' : target,
    type: 'map' as const,
    official: false,
    bytes: 3,
    modifiedAt: null,
  }
  const record = {
    localId: 'local',
    package: {
      name: 'Test',
      type: 'customize',
      description: '',
      version: '1',
      author: 'A',
      maps: [{ name: 'entry.SC2Map', source_path: '/Maps/Start.SC2Map' }],
    },
    mode: 'scnexus',
    launcherTarget: target,
    gameRoot: root,
    managementDirectory: join(paths.customizeDataRoot, 'local'),
    descriptorPath: join(paths.customizeDataRoot, 'local', 'package.json'),
    payloadDirectory: null,
    files: [file],
    installedFiles: [
      { ...file, absolutePath: 'untrusted path must not be used', result: 'kept', hash: 'digest' },
    ],
  } as ContentRecord
  mocks.paths.mockResolvedValue(paths)
  mocks.list.mockReturnValue({ records: [record] } as ContentStore)
  mocks.run.mockResolvedValue(undefined)
  return { record, absolute, paths }
}
test.each([false, true])(
  'launches installed file or component directory from safe logical target (directory=%s)',
  async (directory) => {
    const f = await fixture(directory)
    await launch('local')
    expect(mocks.lock).toHaveBeenCalledOnce()
    expect(mocks.run).toHaveBeenCalledExactlyOnceWith({ run: f.absolute })
  },
)
test('rejects renderer paths, unknown records, mods, missing resources and explicit null', async () => {
  const f = await fixture()
  await expect(launch(f.absolute)).rejects.toThrow(expect.any(Error))
  f.record.launcherTarget = 'Mods/Core.SC2Mod'
  await expect(launch('local')).rejects.toThrow(expect.any(Error))
  f.record.launcherTarget = '../escape.SC2Map'
  await expect(launch('local')).rejects.toThrow(expect.any(Error))
  f.record.launcherTarget = null
  await expect(launch('local')).rejects.toThrow(expect.any(Error))
  f.record.launcherTarget = 'Maps/Start.SC2Map'
  await rm(f.absolute)
  await expect(launch('local')).rejects.toThrow(expect.any(Error))
  expect(mocks.run).not.toHaveBeenCalled()
})
test('manifest launcher wins over a stored user override and needs installed map ownership', async () => {
  const f = await fixture()
  f.record.package.launcher = { name: 'entry.SC2Map' }
  f.record.launcherTarget = null
  await launch('local')
  expect(mocks.run).toHaveBeenCalledWith({ run: f.absolute })
  mocks.run.mockClear()
  f.record.installedFiles = []
  await expect(launch('local')).rejects.toThrow(expect.any(Error))
  expect(mocks.run).not.toHaveBeenCalled()
})

test('post-install launcher selection overrides manifest locally and persists without editing package.json', async () => {
  const f = await fixture()
  await mkdir(f.record.managementDirectory, { recursive: true })
  f.record.package.launcher = { name: 'entry.SC2Map' }
  await writeFile(f.record.descriptorPath, 'original-package')
  const updated = await setLauncher('local', null)
  expect(updated.launcherCustomized).toBe(true)
  expect(updated.launcherTarget).toBeNull()
  expect(
    JSON.parse(await readFile(join(f.record.managementDirectory, 'install-manifest.json'), 'utf8'))
      .launcherTarget,
  ).toBeNull()
  expect(await readFile(f.record.descriptorPath, 'utf8')).toBe('original-package')
  mocks.list.mockReturnValue({ records: [updated] } as ContentStore)
  await expect(launch('local')).rejects.toThrow(expect.any(Error))
  await expect(setLauncher('local', 'Maps/Unknown.SC2Map')).rejects.toThrow(expect.any(Error))
  const restored = await setLauncher('local', 'Maps/Start.SC2Map')
  expect(restored.launcherTarget).toBe('Maps/Start.SC2Map')
})
