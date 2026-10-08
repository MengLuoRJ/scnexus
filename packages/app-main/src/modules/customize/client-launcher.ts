import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { getGamePaths } from "../scii-game-setting";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import type { GameExecutableParameters } from "@scnexus/app-shared/types/customize/client-launcher.type";
async function launch(path: string, args: string[]) {
  try {
    if (!(await stat(path)).isFile()) throw new Error("Executable missing");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(path, args, { windowsHide: false, stdio: "ignore" });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  } catch (cause) {
    throw new AppError(ERRORS.GAME_LAUNCH_FAILED, {}, { cause });
  }
}
export async function runGameClient() {
  await launch((await getGamePaths()).client, [
    "-sso=1",
    "-launch",
    "-uid",
    "s2",
  ]);
}
export async function runGameExecutable(parameters?: GameExecutableParameters) {
  const args: string[] = [];
  if (parameters) {
    if (typeof parameters !== "object" || Array.isArray(parameters))
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    for (const key of [
      "run",
      "testmod",
      "displaymode",
      "preload",
      "meleeMod",
      "difficulty",
      "speed",
    ] as const) {
      const value = parameters[key];
      if (value !== undefined) {
        if (!["string", "number"].includes(typeof value))
          throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
        args.push("-" + key, String(value));
      }
    }
    for (const key of ["trigdebug", "NoUserCheats", "reloadcheck"] as const)
      if (parameters[key] === true) args.push("-" + key);
  }
  await launch((await getGamePaths()).switcher, args);
}
export async function runEditorExecutable(path?: string) {
  if (path !== undefined && typeof path !== "string")
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
  await launch((await getGamePaths()).editor, path ? [path] : []);
}
