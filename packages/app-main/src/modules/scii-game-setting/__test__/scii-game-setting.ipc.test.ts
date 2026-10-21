import { expect, test, vi } from 'vitest'

const register = vi.hoisted(() => vi.fn<typeof import('../../../utils/ipc-util').ipcHandle>())
vi.mock('../../../utils/ipc-util', () => ({ ipcHandle: register }))
vi.mock('../scii-game-setting', () => ({
  reinitializeGame: vi.fn<typeof import('../scii-game-setting').reinitializeGame>(),
  getGameSnapshot: vi.fn<typeof import('../scii-game-setting').getGameSnapshot>(),
}))

import { initGameSettingIpc } from '../scii-game-setting.ipc'

test('registers only the current game-setting contract', () => {
  initGameSettingIpc()
  expect(register.mock.calls.map(([channel]) => channel)).toEqual([
    'scii-game-setting:get',
    'scii-game-setting:configure',
    'scii-game-setting:initialize',
    'scii-game-setting:refresh',
  ])
})
