import { test, expect, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createElectronBackend } from "../../../stores/store-electron-backend";
import {
  sciiGameSettingRepository,
  configureGameDefaults,
} from "../../../stores/scii-game-setting";
import {
  configureGame,
  getGameSnapshot,
  withGameLock,
} from "../scii-game-setting";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0))
    await rm(dir, { recursive: true, force: true });
});
test("game configuration detects paths, protects valid root, and rejects changes during tasks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scnexus-game-setting-"));
  dirs.push(directory);
  configureGameDefaults(join(directory, "documents"));
  sciiGameSettingRepository.init(
    await createElectronBackend("game", directory),
  );
  const game = join(directory, "game");
  await mkdir(game);
  await writeFile(join(game, "StarCraft II.exe"), "stub");
  await mkdir(join(game, "Support64"));
  await writeFile(join(game, "Support64/SC2Switcher_x64.exe"), "stub");
  const snapshot = await configureGame(game);
  expect(snapshot.paths?.customizeDataRoot).toBe(
    join(game, "SCNexusCustomizeData"),
  );
  expect(snapshot.capabilities).toEqual({
    client: true,
    switcher: true,
    editor: false,
  });
  expect("GAME_VERSION" in snapshot).toBe(false);
  await expect(configureGame(join(directory, "missing"))).rejects.toMatchObject(
    { code: "M013" },
  );
  expect((await getGameSnapshot()).gameRoot).toBe(game);
  await withGameLock(async () => {
    await expect(configureGame(game)).rejects.toMatchObject({ code: "M015" });
  });
});
