import { initializeSetting, disposeSetting } from "./setting";
import { initSettingIpc } from "./setting.ipc";
export * from "./setting";
export function initSettingModule() {
  initSettingIpc();
  initializeSetting();
}
export { disposeSetting };
