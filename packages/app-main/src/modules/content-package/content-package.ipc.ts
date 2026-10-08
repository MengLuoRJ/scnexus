import { ipcHandle } from "../../utils/ipc-util";
import { contentService } from "./content-package";
export function initContentPackageIpc() {
  ipcHandle("content-package:cancel", (id: string) =>
    contentService.cancel(id),
  );
  ipcHandle("content-package:scan", () => contentService.scan());
}
