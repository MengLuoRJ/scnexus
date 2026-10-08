import { join, resolve, isAbsolute } from "node:path";
import { stat, mkdir, realpath } from "node:fs/promises";
import { sciiGameSettingRepository } from "../../stores/scii-game-setting";
import type { GamePaths } from "@scnexus/app-shared/types/content.type";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
let busy = false;
export async function withGameLock<T>(run: () => Promise<T>): Promise<T> {
  if (busy) throw new AppError(ERRORS.TASK_CONFLICT);
  busy = true;
  try {
    return await run();
  } finally {
    busy = false;
  }
}
export function gamePaths(
  root: string,
  documents: string,
  revision = 0,
): GamePaths {
  return {
    _revision: revision,
    gameRoot: root,
    mapsRoot: join(root, "Maps"),
    modsRoot: join(root, "Mods"),
    customizeDataRoot: join(root, "SCNexusCustomizeData"),
    ccmRoot: join(root, "Maps", "CustomCampaigns"),
    client: join(root, "StarCraft II.exe"),
    switcher: join(root, "Support64", "SC2Switcher_x64.exe"),
    editor: join(root, "Support64", "SC2Editor_x64.exe"),
    documentsRoot: join(documents, "StarCraft II"),
    banksRoot: join(documents, "StarCraft II", "Banks"),
    arcadeBanksRoot: join(documents, "StarCraft II", "ArcadeBanks"),
  };
}
export async function getGamePaths(): Promise<GamePaths> {
  const data = sciiGameSettingRepository.getSnapshot();
  if (!data.gameRoot) throw new AppError(ERRORS.PROFILE_NOT_READY);
  try {
    if (!(await stat(join(data.gameRoot, "StarCraft II.exe"))).isFile())
      throw new Error("Missing client");
  } catch (cause) {
    throw new AppError(ERRORS.PROFILE_GAME_ROOT_INVALID, {}, { cause });
  }
  return gamePaths(data.gameRoot, data.documentRoot, data._revision);
}
export async function configureGame(input: unknown) {
  if (busy) throw new AppError(ERRORS.PROFILE_CHANGE_BLOCKED);
  if (typeof input !== "string" || !isAbsolute(input))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
  return withGameLock(async () => {
    let root: string;
    try {
      root = await realpath(resolve(input));
      if (!(await stat(join(root, "StarCraft II.exe"))).isFile())
        throw new Error("Invalid client");
    } catch (cause) {
      throw new AppError(ERRORS.PROFILE_GAME_ROOT_INVALID, {}, { cause });
    }
    const old = sciiGameSettingRepository.getSnapshot();
    const paths = gamePaths(root, old.documentRoot);
    for (const dir of [
      paths.mapsRoot,
      paths.modsRoot,
      paths.customizeDataRoot,
      paths.ccmRoot,
    ])
      await mkdir(dir, { recursive: true });
    sciiGameSettingRepository.update({
      ...old,
      gameRoot: root,
      customizeDataRoot: paths.customizeDataRoot,
      confirmedAt: Date.now(),
    });
    return getGameSnapshot();
  });
}
export async function getGameSnapshot() {
  const setting = sciiGameSettingRepository.getSnapshot();
  try {
    const paths = await getGamePaths();
    const capabilities = { client: true, switcher: false, editor: false };
    for (const key of ["switcher", "editor"] as const) {
      try {
        capabilities[key] = (await stat(paths[key])).isFile();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return { ...setting, paths, capabilities };
  } catch (error) {
    if (error instanceof AppError)
      return {
        ...setting,
        paths: null,
        capabilities: { client: false, switcher: false, editor: false },
      };
    throw error;
  }
}
export async function initializeGame() {
  const data = sciiGameSettingRepository.getSnapshot();
  if (data.gameRoot) {
    try {
      await configureGame(data.gameRoot);
      return;
    } catch {
      return;
    }
  }
  if (process.platform === "win32") {
    try {
      const { default: reg } = await import("../../utils/reg");
      const key =
        "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StarCraft II";
      const value = (await reg.list([key]))[key].values.InstallLocation.value;
      await configureGame(value);
    } catch {
      return;
    }
  }
}
