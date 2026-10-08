import { initGameSettingIpc } from "./scii-game-setting.ipc";
import { initGameStore } from "../../stores";
import { initializeGame } from "./scii-game-setting";
export * from "./scii-game-setting";
export async function initSciiGameSettingModule() {
  initGameSettingIpc();
  await initGameStore();
  await initializeGame();
}
