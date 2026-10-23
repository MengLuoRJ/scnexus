import { beforeEach, expect, test, vi } from 'vitest'
import { join } from 'node:path'
const state = vi.hoisted(() => ({ names: [] as string[], link: false }))
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  readdir: async () =>
    state.names.map((name) => ({
      name,
      isDirectory: () => true,
      isSymbolicLink: () => state.link,
    })),
}))
import { macResourceRoot } from '../mac-game'
beforeEach(() => {
  state.names = []
  state.link = false
})
test('different Maps and maps directories are ambiguous and neither is silently chosen', async () => {
  state.names = ['Maps', 'maps', 'Mods']
  await expect(macResourceRoot('game', 'Maps')).rejects.toThrow('Ambiguous resource directories')
  expect(await macResourceRoot('game', 'Mods')).toBe(join('game', 'Mods'))
})
test('a linked resource root is not accepted even if its name matches', async () => {
  state.names = ['maps']
  state.link = true
  await expect(macResourceRoot('game', 'Maps')).rejects.toThrow('regular directory')
})
