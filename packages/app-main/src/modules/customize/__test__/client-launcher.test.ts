import { test, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
type LaunchProcess = EventEmitter & { unref: () => void }
const calls = vi.hoisted(() => ({
  spawn:
    vi.fn<
      (
        file: string,
        args: string[],
        options: import('node:child_process').SpawnOptions,
      ) => LaunchProcess
    >(),
  access: vi.fn<(path: string, mode: number) => Promise<void>>(async () => {}),
  stat: vi.fn<(path: string) => Promise<Pick<import('node:fs').Stats, 'isFile'>>>(),
}))
vi.mock('node:child_process', () => ({ spawn: calls.spawn }))
vi.mock('node:fs/promises', () => ({ stat: calls.stat, access: calls.access }))
vi.mock('../../scii-game-setting', () => ({
  getGamePaths: async () => ({
    client: 'client.exe',
    switcher: 'switcher.exe',
    editor: 'editor.exe',
  }),
}))
import { join } from 'node:path'
import {
  launchCommand,
  runGameClient,
  runGameExecutable,
  runEditorExecutable,
} from '../client-launcher'
test('macOS bundles launch through LaunchServices with fresh instance and exact argument boundaries', () => {
  const bundle = join(process.cwd(), 'StarCraft II', 'Versions', 'Base123', 'SC2.app')
  const path = join(bundle, 'Contents', 'MacOS', 'SC2')
  expect(launchCommand(path, ['-run', 'map with spaces.SC2Map'], 'darwin')).toEqual({
    executable: '/usr/bin/open',
    args: ['-n', '-a', bundle, '--args', '-run', 'map with spaces.SC2Map'],
  })
  expect(launchCommand('client.exe', ['-launch'], 'win32')).toEqual({
    executable: 'client.exe',
    args: ['-launch'],
  })
})
beforeEach(() => {
  calls.spawn.mockReset()
  calls.stat.mockReset()
  calls.stat.mockResolvedValue({ isFile: () => true })
  calls.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn<() => void>() })
    queueMicrotask(() => child.emit('spawn'))
    return child
  })
})
test('game launch uses argument arrays and resolves on spawn instead of waiting for exit', async () => {
  await runGameClient()
  expect(calls.spawn).toHaveBeenCalledWith(
    'client.exe',
    process.platform === 'darwin' ? [] : ['-sso=1', '-launch', '-uid', 's2'],
    expect.objectContaining({ stdio: 'ignore' }),
  )
  await runGameExecutable({ run: 'a map with spaces.SC2Map', trigdebug: true })
  expect(calls.spawn).toHaveBeenCalledWith(
    'switcher.exe',
    ['-run', 'a map with spaces.SC2Map', '-trigdebug'],
    expect.anything(),
  )
  await runEditorExecutable('Map.SC2Map')
  expect(calls.spawn).toHaveBeenCalledWith('editor.exe', ['Map.SC2Map'], expect.anything())
})
test('missing executable reports the registered launch error', async () => {
  calls.stat.mockRejectedValue(Error('missing'))
  await expect(runGameClient()).rejects.toMatchObject({
    code: 'M044',
    name: 'GAME-LAUNCH-FAILED',
  })
})
