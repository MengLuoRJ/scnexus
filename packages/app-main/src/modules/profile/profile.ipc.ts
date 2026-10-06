import { profileStore, getProfileStoreKey } from "@/stores/profile";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import { ipcHandle } from "@/utils/ipc-util";
import { initGameService } from ".";

export function initProfileIpc() {
  ipcHandle("profile:get-profile", () => profileStore.store);
  ipcHandle("profile:get-profile-key", getProfileStoreKey);
  ipcHandle("profile:set-profile-key", () => {
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
      message: "Use profile:init-game-service to configure the game",
    });
  });

  ipcHandle("profile:init-game-service", (path: unknown) => {
    if (path !== undefined && (typeof path !== "string" || !path.trim()))
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    return initGameService(path as string | undefined);
  });
}
