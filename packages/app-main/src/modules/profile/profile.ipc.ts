import {
  profileStore,
  profileStoreFunction,
} from "@/stores/profile";
import { ipcHandle } from "@/utils/ipc-util";
import { initGameService } from ".";

export function initProfileIpc() {
  ipcHandle("profile:get-profile", () => profileStore.store);
  ipcHandle("profile:get-profile-key", profileStoreFunction.get);
  ipcHandle("profile:set-profile-key", profileStoreFunction.set);

  ipcHandle("profile:init-game-service", initGameService);
}
