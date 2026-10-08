import { initGameSettingIpc } from "./scii-game-setting.ipc";
import { initializeGame } from "./scii-game-setting";
export * from "./scii-game-setting";
export async function initSciiGameSettingModule() {
  initGameSettingIpc();
  await initializeGame();
}
