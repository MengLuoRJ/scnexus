import { ipcHandleTyped } from "../../utils/ipc-util";
import { reinitializeGame, getGameSnapshot } from "./scii-game-setting";

export function initGameSettingIpc() {
  ipcHandleTyped("scii-game-setting:get", getGameSnapshot);
  ipcHandleTyped("scii-game-setting:configure", reinitializeGame);
  ipcHandleTyped("scii-game-setting:initialize", reinitializeGame);
  ipcHandleTyped("scii-game-setting:refresh", getGameSnapshot);
}
