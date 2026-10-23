import { test, expect, vi, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createElectronBackend } from '../../../stores/store-electron-backend'
import { sciiGameSettingRepository, configureGameDefaults } from '../../../stores/scii-game-setting'
import {
  configureGame,
  getGameSnapshot,
  withGameLock,
  initializeGame,
  onGameConfigured,
} from '../scii-game-setting'
vi.mock('electron', () => ({ app: { isPackaged: false, getPath: () => process.cwd() } }))
const dirs: string[] = []
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
test('game configuration detects paths, protects valid root, and rejects changes during tasks', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scnexus-game-setting-'))
  dirs.push(directory)
  configureGameDefaults(join(directory, 'documents'))
  sciiGameSettingRepository.init(await createElectronBackend('game', directory))
  const game = join(directory, 'game')
  await mkdir(game)
  const client =
    process.platform === 'darwin'
      ? join(game, 'SC2.app', 'Contents', 'MacOS', 'SC2')
      : join(game, 'StarCraft II.exe')
  await mkdir(join(client, '..'), { recursive: true })
  await writeFile(client, 'stub')
  await chmod(client, 0o755)
  await mkdir(join(game, 'Support64'))
  const switcher =
    process.platform === 'darwin'
      ? join(game, 'Support', 'SC2Switcher')
      : join(game, 'Support64', 'SC2Switcher_x64.exe')
  await mkdir(join(switcher, '..'), { recursive: true })
  await writeFile(switcher, 'stub')
  await chmod(switcher, 0o755)
  const dependent = vi.fn<() => Promise<void>>(async () => {})
  onGameConfigured(dependent)
  const snapshot = await configureGame(game)
  expect(dependent).toHaveBeenCalledOnce()
  dependent.mockRejectedValueOnce(new Error('store unavailable'))
  await expect(initializeGame()).rejects.toMatchObject({ code: 'M058' })
  await initializeGame()
  expect(dependent).toHaveBeenCalledTimes(3)
  onGameConfigured(undefined)
  expect(snapshot.paths?.customizeDataRoot).toBe(join(game, 'SCNexusCustomizeData'))
  expect(snapshot.capabilities).toEqual({
    client: true,
    switcher: true,
    editor: false,
  })
  expect('GAME_VERSION' in snapshot).toBe(false)
  await expect(configureGame(join(directory, 'missing'))).rejects.toMatchObject({ code: 'M013' })
  expect((await getGameSnapshot()).gameRoot).toBe(game)
  await rm(client)
  const missing = await initializeGame().then(
    (value) => value.capabilities.client,
    (error: { code: string }) => error.code,
  )
  expect(missing).toBe(process.platform === 'darwin' ? false : 'M013')
  await writeFile(client, 'stub')
  await chmod(client, 0o755)
  await withGameLock(async () => {
    await expect(configureGame(game)).rejects.toMatchObject({ code: 'M015' })
  })
})
