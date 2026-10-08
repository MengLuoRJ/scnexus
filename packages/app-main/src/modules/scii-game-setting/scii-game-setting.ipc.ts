import { ipcHandleTyped } from "../../utils/ipc-util";
import { configureGame, getGameSnapshot } from "./scii-game-setting";

export function initGameSettingIpc() {
  ipcHandleTyped("scii-game-setting:get", getGameSnapshot);
  ipcHandleTyped("scii-game-setting:configure", configureGame);
  ipcHandleTyped("scii-game-setting:refresh", getGameSnapshot);
}
