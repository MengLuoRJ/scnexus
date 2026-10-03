import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import {
  File, CascOpenLocalFile, CascStorageBinding, CascError,
  CASC_STRICT_DATA_CHECK, CASC_LOCALE_ALL, SetCascError, GetCascError,
} from "../dist/compat/index.js";

function blte(bytes, compressed) {
  const block = Buffer.concat([Buffer.from(compressed ? "Z" : "N"), compressed ? deflateSync(bytes) : bytes]);
  const header = Buffer.alloc(36);
  header.write("BLTE");
  header.writeUInt32BE(36, 4);
  header[8] = 0x0f;
  header[11] = 1;
  header.writeUInt32BE(block.length, 12);
  header.writeUInt32BE(bytes.length, 16);
  createHash("md5").update(block).digest().copy(header, 20);
  return Buffer.concat([header, block]);
}

test("reference File API reads, seeks and asynchronously decodes real BLTE", async () => {
  const directory = await mkdtemp(join(tmpdir(), "casclib-reference-"));
  const bytes = Buffer.from("reference CASC decoding\n".repeat(1000));
  try {
    for (const compressed of [false, true]) {
      const path = join(directory, `${compressed}.blte`);
      await writeFile(path, blte(bytes, compressed));
      const file = new File(CascOpenLocalFile(path, CASC_STRICT_DATA_CHECK));
      try {
        assert.equal(file.getSize64(), bytes.length);
        assert.deepEqual(file.read(9), bytes.subarray(0, 9));
        assert.equal(file.getPosition64(), 9);
        file.setPosition64(0);
        assert.deepEqual(file.readAll(), bytes);
        file.setPosition64(0);
        assert.deepEqual(await file.readAllAsync(), bytes);
      } finally { file.close(); }
      assert.throws(() => file.read(1));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("reference raw storage API preserves native error codes and exports", async () => {
  const directory = await mkdtemp(join(tmpdir(), "casclib-reference-missing-"));
  const storage = new CascStorageBinding();
  try {
    SetCascError(87);
    assert.equal(GetCascError(), 87);
    assert.equal(typeof storage.CascOpenStorageEx, "function");
    assert.equal(typeof storage.CascImportKeysFromString, "function");
    assert.equal(typeof storage.CascFindFirstFile, "function");
    assert.throws(() => storage.CascOpenStorage(join(directory, "missing"), CASC_LOCALE_ALL), (error) => {
      assert.equal(typeof error.code, "number");
      assert.equal(typeof error.codeName, "string");
      return true;
    });
    const { Storage } = await import("../dist/compat/index.js");
    assert.throws(() => Storage.open(join(directory, "missing")), CascError);
  } finally {
    storage.CascCloseStorage();
    await rm(directory, { recursive: true, force: true });
  }
});