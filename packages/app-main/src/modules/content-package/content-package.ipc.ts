import { ipcHandleTyped } from "../../utils/ipc-util";
import { contentService } from "./content-package";
export function initContentPackageIpc() {
  ipcHandleTyped("content-package:cancel", (id: string) =>
    contentService.cancel(id),
  );
  ipcHandleTyped("content-package:scan", () => contentService.scan());
}
