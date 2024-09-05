import { useIpcRendererInvoke } from "./ipc-util";
import {
  OpenDialogOptions,
  OpenDialogReturnValue,
  OpenDialogSyncOptions,
} from "electron";

const moduleChannel = "dialog";

export const ipcDialog = {
  showOpenDialogSync: (options: OpenDialogSyncOptions) =>
    useIpcRendererInvoke<string[]>(
      `${moduleChannel}:show-open-dialog-sync`,
      options
    ),

  showOpenDialog: (options: OpenDialogOptions) =>
    useIpcRendererInvoke<OpenDialogReturnValue>(
      `${moduleChannel}:show-open-dialog`,
      options
    ),
};
