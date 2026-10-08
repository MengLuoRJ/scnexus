import assert from "node:assert/strict";
import { test, afterAll, vi } from "vitest";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createElectronBackend } from "../store-electron-backend";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import {
  createSettingRepository,
  configureSettingDefaults,
  settingRepository,
  getSettingStore,
  getSettingStoreKey,
  updateSettingStore,
} from "../setting";
import { createSciiGameSettingRepository } from "../scii-game-setting";
import type {
  PersistenceBackend,
  RepositoryOptions,
  StoreVersion,
} from "../store-repository";

const root = resolve(".store-tests-" + randomUUID());
mkdirSync(root);
afterAll(() => rmSync(root, { recursive: true, force: true }));

// Only failures are injected; all reads, schema validation and successful writes
// use the installed electron-store v11 implementation and real JSON files.
class FileBackend implements PersistenceBackend {
  writes = 0;
  failWrite = false;
  failRead = false;
  constructor(
    readonly directory: string,
    readonly backend: PersistenceBackend,
  ) {}
  get path() {
    return join(this.directory, "test.json");
  }
  get raw(): string | undefined {
    try {
      return readFileSync(this.path, "utf8");
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw cause;
    }
  }
  get backups() {
    return readdirSync(this.directory)
      .filter((name) => name.endsWith(".bak"))
      .map((name) => ({
        raw: readFileSync(join(this.directory, name), "utf8"),
        reason: name.includes(".migration-") ? "migration" : "corrupt",
      }));
  }
  open<T extends StoreVersion>(options: RepositoryOptions<T>) {
    if (this.failRead) throw new AppError(ERRORS.STORE_READ_FAILED);
    const before = this.raw;
    const store = this.backend.open(options);
    if (this.raw !== before) this.writes++;
    const backend = this;
    return {
      get store() {
        return store.store;
      },
      set store(data: T) {
        if (backend.failWrite) throw new Error("Disk full (injected)");
        store.store = data;
        backend.writes++;
      },
    };
  }
}
async function fileBackend(data?: unknown, raw?: string) {
  const directory = join(root, randomUUID());
  mkdirSync(directory);
  if (raw !== undefined || data !== undefined)
    writeFileSync(join(directory, "test.json"), raw ?? JSON.stringify(data));
  return new FileBackend(
    directory,
    await createElectronBackend("test", directory),
  );
}
const downloads = "D:\\Downloads";
const documents = "D:\\Documents";
const setting = () => createSettingRepository(() => downloads);
const code = (expected: string) => (error: unknown) =>
  error instanceof AppError && error.code === expected;
const legacySetting = {
  IS_INITIAL: true,
  CLIENT_ID: "existing-client",
  DOWNLOAD_FOLDER: downloads,
  LAST_UPDATED_TIME: 12345,
  PRESETS: "legacy-preset",
};
test("imports do not initialize stores or load Electron", async () => {
  await import("../index");
  assert.throws(
    () => setting().getSnapshot(),
    code(ERRORS.APP_INITIALIZATION_FAILED.code),
  );
});

test("first run writes validated defaults only once and snapshots are detached", async () => {
  const repository = setting();
  const backend = await fileBackend();
  const snapshot = repository.init(backend);
  assert.equal(snapshot._schemaVersion, 2);
  assert.equal(snapshot._revision, 0);
  assert.equal(snapshot.lastUpdatedAt, null);
  assert.equal(snapshot.displayLanguage, "system");
  assert.equal(snapshot.logLevel, "error");
  assert.equal(snapshot.telemetryEnabled, false);
  assert.ok(snapshot.clientId);
  snapshot.clientId = "mutated";
  assert.notEqual(repository.getKey("clientId"), "mutated");
  repository.init(backend);
  assert.equal(backend.writes, 1);
});

test("v10 settings preserve identity/downloads, back up original, and do not infer update success", async () => {
  const backend = await fileBackend(legacySetting);
  const original = backend.raw;
  const snapshot = setting().init(backend);
  assert.equal(snapshot.clientId, legacySetting.CLIENT_ID);
  assert.equal(snapshot.downloadDirectory, downloads);
  assert.equal(snapshot.lastUpdatedAt, null);
  assert.equal(snapshot.logLevel, "error");
  assert.equal(snapshot.telemetryEnabled, false);
  assert.deepEqual(backend.backups, [{ raw: original, reason: "migration" }]);
  const reloaded = setting().init(backend);
  assert.deepEqual(reloaded, snapshot);
  assert.equal(backend.backups.length, 1);
  assert.equal(backend.writes, 1);
});

test("complete/key updates validate every field and commit one _revision atomically", async () => {
  const repository = setting();
  const backend = await fileBackend();
  repository.init(backend);
  repository.updateKey("displayLanguage", "en");
  assert.equal(repository.getKey("_revision"), 1);
  const full = repository.getSnapshot();
  repository.update({ ...full, logLevel: "debug", telemetryEnabled: true });
  assert.equal(repository.getKey("_revision"), 2);
  assert.equal(backend.writes, 3);
  for (const [key, value] of [
    ["displayLanguage", "fr-FR"],
    ["logLevel", "silent"],
    ["telemetryEnabled", "yes"],
    ["downloadDirectory", "relative"],
    ["clientId", ""],
    ["lastUpdatedAt", -1],
    ["_schemaVersion", 5],
    ["_revision", 99],
    ["unknown", true],
  ]) {
    const before = repository.getSnapshot();
    assert.throws(
      () => repository.updateKey(key as never, value as never),
      code(ERRORS.STORE_DATA_INVALID.code),
    );
    assert.deepEqual(repository.getSnapshot(), before);
  }
  assert.throws(
    () =>
      repository.update({
        ...repository.getSnapshot(),
        logLevel: "bad",
      } as never),
    code(ERRORS.STORE_DATA_INVALID.code),
  );
  assert.throws(
    () =>
      repository.update({ ...repository.getSnapshot(), extra: true } as never),
    code(ERRORS.STORE_DATA_INVALID.code),
  );
  assert.equal(backend.writes, 3);
});

test("write failures retain the last effective snapshot and _revision and can retry", async () => {
  const repository = setting();
  const backend = await fileBackend();
  repository.init(backend);
  const before = repository.getSnapshot();
  const original = backend.raw;
  backend.failWrite = true;
  assert.throws(
    () => repository.updateKey("downloadDirectory", "D:\\Other"),
    code(ERRORS.STORE_WRITE_FAILED.code),
  );
  assert.deepEqual(repository.getSnapshot(), before);
  assert.equal(backend.raw, original);
  backend.failWrite = false;
  assert.equal(
    repository.updateKey("downloadDirectory", "D:\\Other")._revision,
    1,
  );
});

test("invalid JSON and schema back up without overwriting or becoming usable", async () => {
  for (const raw of [
    "{broken",
    "null",
    JSON.stringify({ ...legacySetting, DOWNLOAD_FOLDER: "relative" }),
    JSON.stringify({ _schemaVersion: 1, _revision: 0 }),
  ]) {
    const repository = setting();
    const backend = await fileBackend(undefined, raw);
    assert.throws(
      () => repository.init(backend),
      code(ERRORS.STORE_DATA_INVALID.code),
    );
    assert.equal(backend.raw, raw);
    assert.equal(backend.writes, 0);
    assert.deepEqual(backend.backups, [{ raw, reason: "corrupt" }]);
    assert.throws(
      () => repository.getSnapshot(),
      code(ERRORS.APP_INITIALIZATION_FAILED.code),
    );
  }
});

test("future versions cannot be overwritten, even by migration", async () => {
  for (const data of [
    { _schemaVersion: 3, _revision: 10 },
    { schemaVersion: 3, revision: 10 },
  ]) {
    const backend = await fileBackend(data);
    assert.throws(
      () => setting().init(backend),
      code(ERRORS.STORE_VERSION_UNSUPPORTED.code),
    );
    assert.equal(backend.writes, 0);
    assert.equal(backend.backups.length, 0);
    assert.equal(backend.raw, JSON.stringify(data));
  }
});

test("read failures remain explicit and retryable", async () => {
  const backend = await fileBackend(legacySetting);
  const repository = setting();
  backend.failRead = true;
  assert.throws(
    () => repository.init(backend),
    code(ERRORS.STORE_READ_FAILED.code),
  );
  assert.equal(backend.backups.length, 0);
  backend.failRead = false;
  assert.equal(repository.init(backend).clientId, legacySetting.CLIENT_ID);
});

test("previous unprefixed model migrates exactly once without losing business fields", async () => {
  const original = {
    schemaVersion: 1,
    revision: 17,
    lastConfirmedVersion: "0.0.20",
    clientId: "old-client",
    lastUpdatedAt: 123,
    downloadDirectory: downloads,
    displayLanguage: "en",
    logLevel: "debug",
    telemetryEnabled: true,
  };
  const backend = await fileBackend(original);
  const migrated = setting().init(backend);
  assert.equal(migrated._schemaVersion, 2);
  assert.equal(migrated._revision, 17);
  assert.equal(migrated._lastConfirmedVersion, "0.0.20");
  assert.equal(migrated.clientId, original.clientId);
  assert.equal(migrated.lastUpdatedAt, 123);
  assert.equal(migrated.telemetryEnabled, true);
  assert.equal(Object.hasOwn(migrated, "schemaVersion"), false);
  assert.equal(Object.hasOwn(migrated, "revision"), false);
  assert.deepEqual(setting().init(backend), migrated);
  assert.equal(backend.backups.length, 1);
  assert.equal(backend.writes, 1);
});

test("reads reflect the real store rather than a duplicate snapshot", async () => {
  const backend = await fileBackend();
  const repository = setting();
  const data = repository.init(backend);
  writeFileSync(backend.path, JSON.stringify({ ...data, logLevel: "info" }));
  assert.equal(repository.getKey("logLevel"), "info");
});

test("migration backup and commit failures preserve original bytes and remain retryable", async () => {
  for (const operation of ["copyFileSync", "renameSync"] as const) {
    const backend = await fileBackend(legacySetting);
    const original = backend.raw;
    const repository = setting();
    const mocked = vi.spyOn(fs, operation).mockImplementation(() => {
      throw new Error("Injected migration IO failure");
    });
    syncBuiltinESMExports();
    try {
      assert.throws(
        () => repository.init(backend),
        code(
          operation === "copyFileSync"
            ? ERRORS.STORE_MIGRATION_FAILED.code
            : ERRORS.STORE_WRITE_FAILED.code,
        ),
      );
      assert.equal(backend.raw, original);
      assert.throws(
        () => repository.getSnapshot(),
        code(ERRORS.APP_INITIALIZATION_FAILED.code),
      );
      assert.equal(
        readdirSync(backend.directory).some(
          (name) => name.includes(".migration-") && name.endsWith(".json"),
        ),
        false,
      );
    } finally {
      mocked.mockRestore();
      syncBuiltinESMExports();
    }
    assert.equal(repository.init(backend).clientId, legacySetting.CLIENT_ID);
  }
});

test("old profile migrates only confirmed root to game-setting and retains source backup", async () => {
  const backend = await fileBackend({
    _schemaVersion: 1,
    _revision: 4,
    SUCCESS: true,
    PROFILE_GAME: { GAME_ROOT: "D:\\StarCraft II", GAME_VERSION: "old" },
  });
  const repository = createSciiGameSettingRepository(() => documents);
  repository.init(backend);
  assert.equal(repository.getKey("gameRoot"), "D:\\StarCraft II");
  assert.equal(repository.getKey("_schemaVersion"), 3);
  assert.equal("GAME_VERSION" in repository.getSnapshot(), false);
  assert.equal(backend.backups.length, 1);
});

test("setting exports operate on canonical fields after legacy migration", async () => {
  configureSettingDefaults(downloads);
  settingRepository.init(await fileBackend(legacySetting));
  assert.equal(getSettingStoreKey("clientId"), "existing-client");
  assert.equal(getSettingStoreKey("lastUpdatedAt"), null);
  updateSettingStore({
    ...getSettingStore(),
    downloadDirectory: "D:\\NewDownloads",
    displayLanguage: "zh-Hant",
  });
  assert.equal(getSettingStoreKey("downloadDirectory"), "D:\\NewDownloads");
  assert.equal(getSettingStore().displayLanguage, "zh-Hant");
  assert.throws(
    () =>
      updateSettingStore({
        ...getSettingStore(),
        downloadDirectory: "relative",
      }),
    code(ERRORS.STORE_DATA_INVALID.code),
  );
});
test("game-setting v2 renames management root without losing saved configuration", async () => {
  const original = {
    _schemaVersion: 2,
    _revision: 8,
    gameRoot: "D:\\StarCraft II",
    SCNEXUS_CUTOMIZE_DATA_ROOT: "D:\\StarCraft II\\SCNexusCustomizeData",
    documentRoot: documents,
    confirmedAt: 1234,
  };
  const backend = await fileBackend(original);
  const repository = createSciiGameSettingRepository(() => "unused");
  const migrated = repository.init(backend);
  assert.deepEqual(migrated, {
    _schemaVersion: 3,
    _revision: 8,
    gameRoot: original.gameRoot,
    customizeDataRoot: original.SCNEXUS_CUTOMIZE_DATA_ROOT,
    documentRoot: documents,
    confirmedAt: 1234,
  });
  assert.equal(backend.backups.length, 1);
  assert.equal(repository.init(backend)._schemaVersion, 3);
  assert.equal(backend.backups.length, 1);
});

test("setting v1 language codes migrate without losing user preferences", async () => {
  for (const [old, next] of [
    ["zh-CN", "zh"],
    ["en-US", "en"],
    ["zh-TW", "zh-Hant"],
    ["system", "system"],
  ]) {
    const original = {
      _schemaVersion: 1,
      _revision: 9,
      clientId: "client",
      lastUpdatedAt: null,
      _lastConfirmedVersion: null,
      downloadDirectory: downloads,
      displayLanguage: old,
      logLevel: "warn",
      telemetryEnabled: true,
    };
    const backend = await fileBackend(original);
    const result = setting().init(backend);
    assert.equal(result.displayLanguage, next);
    assert.equal(result._revision, 9);
    assert.equal(result.telemetryEnabled, true);
    assert.equal(result._schemaVersion, 2);
    assert.equal(backend.backups.length, 1);
  }
});
