import { test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
let instances: FakeWindow[] = [];
class FakeWindow extends EventEmitter {
  destroyed = false;
  minimized = false;
  webContents = Object.assign(new EventEmitter(), {
    send: vi.fn(),
    isLoadingMainFrame: () => false,
    openDevTools: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  });
  constructor() {
    super();
    instances.push(this);
  }
  isDestroyed() {
    return this.destroyed;
  }
  isMinimized() {
    return this.minimized;
  }
  isMaximized() {
    return false;
  }
  restore() {
    this.minimized = false;
  }
  show() {}
  focus() {}
  async loadFile() {}
  async loadURL() {}
  destroy() {
    this.destroyed = true;
    this.emit("closed");
  }
}
vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd() },
  BrowserWindow: FakeWindow,
}));
vi.mock("../../logging/logging", () => ({ reportError: vi.fn() }));
vi.mock("../../shell", () => ({ openExternalWebsite: vi.fn() }));
const service = await import("../window");
test("window singleton, reload handshake, renderer failure and recreation", async () => {
  const [a, b] = await Promise.all([
    service.restoreOrCreateWindow(),
    service.restoreOrCreateWindow(),
  ]);
  expect(a).toBe(b);
  expect(instances).toHaveLength(1);
  service.sendWhenReady("updater:download-progress", 1);
  service.sendWhenReady("updater:download-progress", 2);
  service.markWindowReady();
  expect(instances[0].webContents.send).toHaveBeenCalledWith(
    "updater:download-progress",
    2,
  );
  instances[0].webContents.emit("did-start-navigation", {}, "", false, true);
  expect(service.getWindowStatus().state).toBe("loading");
  service.sendWhenReady("deeplink:open", 1);
  service.sendWhenReady("deeplink:open", 2);
  service.markWindowReady();
  expect(instances[0].webContents.send).toHaveBeenCalledWith(
    "deeplink:open",
    1,
  );
  expect(instances[0].webContents.send).toHaveBeenCalledWith(
    "deeplink:open",
    2,
  );
  instances[0].webContents.emit("render-process-gone");
  expect(service.getWindowStatus().state).toBe("failed");
  service.destroyMainWindow();
  await service.restoreOrCreateWindow();
  expect(instances).toHaveLength(2);
  service.destroyMainWindow();
});

test("load failure includes underlying Electron reason and permits later recreation", async () => {
  const failure = vi
    .spyOn(FakeWindow.prototype, "loadFile")
    .mockRejectedValueOnce(new Error("ERR_CONNECTION_REFUSED (-102)"));
  await expect(service.restoreOrCreateWindow()).rejects.toMatchObject({
    code: "M017",
    message: expect.stringContaining("ERR_CONNECTION_REFUSED (-102)"),
  });
  expect(service.getMainWindow()).toBeNull();
  failure.mockRestore();
  await service.restoreOrCreateWindow();
  service.destroyMainWindow();
});
