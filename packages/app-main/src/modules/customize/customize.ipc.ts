import { ipcHandleTyped, ipcHandle } from "../../utils/ipc-util";
import * as service from "./customize";
import {
  runGameClient,
  runGameExecutable,
  runEditorExecutable,
} from "./client-launcher";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
export function initCustomizeIpc() {
  ipcHandle("customize:get-installed-customize-list", () => ({
    CUSTOMIZE_LIST: service.list().records.map((r) => ({
      ...r.package,
      type: "Customize",
      localId: r.localId,
      localinfo: {
        metadata_path: r.descriptorPath,
        files_size: r.bytes,
        files_count: r.fileCount,
      },
    })),
  }));
  ipcHandle("customize:scan-installed-customize-list", service.scan);

  for (const action of [
    "read-compress-file-info",
    "install-compress-file",
    "validate-compress-file",
    "read-compress-file-info-7z",
    "install-compress-file-7z",
    "install-customize",
    "uninstall-customize",
  ])
    ipcHandle("customize:" + action, () => {
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
        message: "Use the analyzed install/activation/removal workflow",
      });
    });

  ipcHandle("customize:run-game-client", runGameClient);
  ipcHandle("customize:run-game-executable", runGameExecutable);
  ipcHandle("customize:run-editor-executable", runEditorExecutable);
  ipcHandleTyped("customize:analyze", service.analyze);
  ipcHandleTyped("customize:install", service.install);
  ipcHandleTyped("customize:list", service.list);
  ipcHandleTyped("customize:scan", service.scan);
  ipcHandleTyped("customize:prepare-uninstall", service.prepareUninstall);
  ipcHandleTyped("customize:uninstall", service.uninstall);
}
