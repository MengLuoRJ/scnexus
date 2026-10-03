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
                assert.equal(file.setPosition64(9n), 9);
                assert.throws(() => file.setPosition64(Number.MAX_SAFE_INTEGER + 1), RangeError);
                assert.throws(() => file.setPosition64(1n << 63n), RangeError);
                assert.deepEqual(file.readAll(), bytes.subarray(9));
                assert.equal(file.readAll().length, 0);
                assert.equal(file.read(0).length, 0);
                for (const size of [-1, 1.5, NaN, Infinity, 256 * 1024 * 1024 + 1]) {
                    assert.throws(() => file.read(size), RangeError);
                }
                file.setPosition64(9);
                const pending = file.readAllAsync();
                assert.throws(() => file.close(), /pending/);
                assert.throws(() => file.setPosition64(0), /pending/);
                assert.throws(() => file.readAllAsync(), /pending/);
                assert.deepEqual(await pending, bytes.subarray(9));
                file.setPosition64(0);
                assert.deepEqual(file.readAll(), bytes);
                file.setPosition64(0);
                assert.deepEqual(await file.readAllAsync(), bytes);
            } finally { file.close(); }
            assert.throws(() => file.read(1));
        }
        const oversized = blte(Buffer.from("small"), false);
        oversized.writeUInt32BE(256 * 1024 * 1024 + 1, 16);
        const oversizedPath = join(directory, "oversized.blte");
        await writeFile(oversizedPath, oversized);
        const largeFile = new File(CascOpenLocalFile(oversizedPath, CASC_STRICT_DATA_CHECK));
        try {
            assert.throws(() => largeFile.readAll(), /256 MiB/);
            const pending = largeFile.readAllAsync();
            assert.throws(() => largeFile.close(), /pending/);
            await assert.rejects(pending, /256 MiB/);
        } finally { largeFile.close(); }
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
        const pendingOpen = storage.openAsync(join(directory, "missing"), CASC_LOCALE_ALL);
        assert.throws(() => storage.CascCloseStorage(), /pending/);
        assert.throws(() => storage.openAsync(join(directory, "missing"), CASC_LOCALE_ALL), /pending/);
        await assert.rejects(pendingOpen);
        assert.equal(storage.CascCloseStorage(), false);
        await assert.rejects(storage.openAsync(join(directory, "missing"), CASC_LOCALE_ALL));
    } finally {
        storage.CascCloseStorage();
        await rm(directory, { recursive: true, force: true });
    }
});
