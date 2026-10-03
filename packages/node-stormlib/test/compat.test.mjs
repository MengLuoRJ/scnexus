import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    Archive, MPQArchiveBinding, StormError, MPQ_CREATE_ARCHIVE_V2,
    MPQ_FILE_COMPRESS, MPQ_COMPRESSION_ZLIB, MPQ_OPEN_READ_ONLY,
} from "../dist/compat/index.js";

test("reference Archive/File bindings create, seek, checksum and reopen MPQ files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stormlib-compat-"));
    const path = join(directory, "test.mpq");
    let archive;
    try {
        archive = Archive.create(path, { maxFileCount: 32, flags: MPQ_CREATE_ARCHIVE_V2 });
        const raw = new MPQArchiveBinding();
        assert.equal(typeof raw.SFileOpenPatchArchive, "function");
        assert.equal(typeof raw.SFileEnumLocales, "function");
        const file = archive.createFile("folder/file.txt", 0, 5, 0, MPQ_FILE_COMPRESS);
        file.write(Buffer.from("hello"), MPQ_COMPRESSION_ZLIB);
        file.finish();
        archive.flush();
        const opened = archive.openFile("folder/file.txt");
        assert.equal(opened.getSize(), 5);
        assert.equal(opened.read(2).toString(), "he");
        assert.equal(opened.getPosition(), 2);
        opened.setPosition(0);
        assert.equal(opened.readAll().toString(), "hello");
        opened.close();
        assert.equal(archive.hasFile("folder/file.txt"), true);
        const checksums = archive.getFileChecksums("folder/file.txt");
        assert.equal(typeof checksums.crc32, "number");
        assert.equal(checksums.md5.length, 32);
        archive.close();
        archive = await Archive.openAsync(path, { flags: MPQ_OPEN_READ_ONLY });
        const reopened = archive.openFile("folder/file.txt");
        assert.equal((await reopened.readAllAsync()).toString(), "hello");
        reopened.close();
        assert.throws(() => archive.openFile("missing.txt"), StormError);
    } finally {
        archive?.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("reference API opens embedded MPQ archives", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stormlib-nested-"));
    let inner, outer, nested;
    try {
        const innerPath = join(directory, "inner.mpq");
        inner = Archive.create(innerPath, { flags: MPQ_CREATE_ARCHIVE_V2 });
        inner.addBuffer("content.txt", Buffer.from("nested"));
        inner.close();
        outer = Archive.create(join(directory, "outer.mpq"), { flags: MPQ_CREATE_ARCHIVE_V2 });
        outer.addBuffer("inner.mpq", await readFile(innerPath));
        outer.flush();
        nested = outer.openFileArchive("inner.mpq", { flags: MPQ_OPEN_READ_ONLY });
        const file = nested.openFile("content.txt");
        assert.equal(file.readAll().toString(), "nested");
        file.close();
    } finally {
        nested?.close();
        outer?.close();
        inner?.close();
        await rm(directory, { recursive: true, force: true });
    }
});
