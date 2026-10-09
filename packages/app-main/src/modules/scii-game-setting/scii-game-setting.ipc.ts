import { ipcHandle } from '../../utils/ipc-util'
import { reinitializeGame, getGameSnapshot } from './scii-game-setting'

export function initGameSettingIpc() {
  ipcHandle('scii-game-setting:get', getGameSnapshot)
  ipcHandle('scii-game-setting:configure', reinitializeGame)
  ipcHandle('scii-game-setting:initialize', reinitializeGame)
  ipcHandle('scii-game-setting:refresh', getGameSnapshot)
}
