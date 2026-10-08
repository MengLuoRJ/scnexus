import { ipcMain, type IpcMainInvokeEvent } from "electron";
import {
  AppError,
  ERRORS,
  normalizeError,
  toErrorDto,
} from "@scnexus/app-shared/errors/app.error";
import { assertIpcSource } from "./ipc-source";
import { reportError } from "../modules/logging/logging";
import { getGamePaths } from "../modules/scii-game-setting/scii-game-setting";

async function guard(channel: string, event: IpcMainInvokeEvent) {
  assertIpcSource(event);
  if (/^(campaign|customize):/.test(channel)) await getGamePaths();
}

function register(
  channel: string,
  func: (...args: any[]) => any,
  passEvent: boolean,
  typed: boolean,
) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      await guard(channel, event);
      const data = await (passEvent ? func(event, ...args) : func(...args));
      return typed ? { ok: true, data } : { data };
    } catch (value) {
      const error = normalizeError(value);
      if (error.code !== ERRORS.TASK_CANCELLED.code)
        reportError(error, channel);
      const dto = toErrorDto(error);
      return typed
        ? { ok: false, error: dto }
        : { error: error.message || error.name, errorDetail: dto };
    }
  });
}
export function ipcHandleRegister(
  channel: string,
  func: (...args: any[]) => any,
  passEvent = false,
) {
  register(channel, func, passEvent, false);
}
export function ipcHandleRemove(channel: string) {
  ipcMain.removeHandler(channel);
}
export function ipcHandle(
  channel: string,
  func: (...args: any[]) => any,
  passEvent = false,
) {
  register(channel, func, passEvent, false);
}
export function ipcHandleTyped(
  channel: string,
  func: (...args: any[]) => any,
  passEvent = false,
) {
  register(channel, func, passEvent, true);
}
export type ipcHandleConfig = {
  channel: string;
  function: (...args: any[]) => any;
  passEvent: boolean;
};
