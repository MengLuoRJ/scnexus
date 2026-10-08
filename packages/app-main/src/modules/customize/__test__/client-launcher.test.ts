import { test, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
const calls = vi.hoisted(() => ({ spawn: vi.fn(), stat: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: calls.spawn }));
vi.mock("node:fs/promises", () => ({ stat: calls.stat }));
vi.mock("../../scii-game-setting", () => ({
  getGamePaths: async () => ({
    client: "client.exe",
    switcher: "switcher.exe",
    editor: "editor.exe",
  }),
}));
import {
  runGameClient,
  runGameExecutable,
  runEditorExecutable,
} from "../client-launcher";
beforeEach(() => {
  calls.spawn.mockReset();
  calls.stat.mockReset();
  calls.stat.mockResolvedValue({ isFile: () => true });
  calls.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  });
});
test("game launch uses argument arrays and resolves on spawn instead of waiting for exit", async () => {
  await runGameClient();
  expect(calls.spawn).toHaveBeenCalledWith(
    "client.exe",
    ["-sso=1", "-launch", "-uid", "s2"],
    expect.objectContaining({ stdio: "ignore" }),
  );
  await runGameExecutable({ run: "a map with spaces.SC2Map", trigdebug: true });
  expect(calls.spawn).toHaveBeenCalledWith(
    "switcher.exe",
    ["-run", "a map with spaces.SC2Map", "-trigdebug"],
    expect.anything(),
  );
  await runEditorExecutable("Map.SC2Map");
  expect(calls.spawn).toHaveBeenCalledWith(
    "editor.exe",
    ["Map.SC2Map"],
    expect.anything(),
  );
});
test("missing executable reports the registered launch error", async () => {
  calls.stat.mockRejectedValue(Error("missing"));
  await expect(runGameClient()).rejects.toMatchObject({
    code: "M044",
    name: "GAME-LAUNCH-FAILED",
  });
});
