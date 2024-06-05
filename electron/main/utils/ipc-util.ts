import { ipcMain } from "electron";
import { type IpcMainInvokeEvent } from "electron";
import { Logger } from "./logger";

export function ipcHandleRegister(
  channel: string,
  func: (...args: any[]) => any,
  passEvent: boolean = false
) {
  ipcMain.handle(channel, async (e: IpcMainInvokeEvent, ...args: any[]) => {
    try {
      const dataPromise = passEvent ? func(e, ...args) : func(...args);
      const data = await dataPromise;
      return { data };
    } catch (error) {
      Logger.error(
        `[IPC Communication] Invoke Error: channel = ${channel}, error = ${error}`
      );
      return { error: (error as Error).message };
    }
  });
}

export function ipcHandleRemove(channel: string) {
  ipcMain.removeHandler(channel);
}

export type ipcHandleConfig = {
  channel: string;
  function: (...args: any[]) => any;
  passEvent: boolean;
};

export function ipcHandle(
  channel: string,
  func: (...args: any[]) => any,
  passEvent: boolean = false
) {
  // try remove handle beforce handle another to avoid repeat handle
  ipcHandleRemove(channel);
  // handle ipc channel with function
  ipcHandleRegister(channel, func, passEvent);
}
