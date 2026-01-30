import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import test from "node:test";
import { Archive, Compression, StormLibError } from "../dist/index.js";

test("native codecs, encrypted sectors, tree, rename, delete and reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stormlib-test-"));
    const path = join(directory, "\u661f\u9645.mpq");
    const archive = await Archive.create(path);
    let reopened;
    try {
        const data = Buffer.from("StarCraft II archive data\n".repeat(10000));
        for (const compression of [Compression.NONE, Compression.ZLIB, Compression.BZIP2, Compression.LZMA, Compression.PKWARE]) {
            const name = `files/${compression}.txt`;
            await archive.add(data, { archivePath: name, compression, encrypt: true });
            assert.deepEqual(await archive.readFile(name), data);
        }
        await archive.add(Buffer.alloc(0), { archivePath: "empty" });
        await archive.save();
        assert.equal(await archive.fileCount, 7);
        assert.equal((await archive.listTree()).children.find(node => node.name === "files").children.length, 5);
        await assert.rejects(archive.readFile("files/2.txt", { maxBytes: 10 }), { name: "RangeError" });
        await archive.rename("files/2.txt", "files/new.txt");
        assert.equal(await archive.hasFile("files/2.txt"), false);
        assert.deepEqual(await archive.readFile("files/new.txt"), data);
        await archive.delete("files/8.txt");
        await archive.compact();
        await archive.save();
        await archive.close();
        reopened = await Archive.open(path);
        assert.deepEqual(await reopened.readFile("files/new.txt"), data);
        assert.equal(await reopened.hasFile("files/8.txt"), false);
        assert.equal((await reopened.readFile("empty")).length, 0);
        await assert.rejects(reopened.delete("empty"), /read-only/);
        await assert.rejects(reopened.readFile("missing"), StormLibError);
    } finally {
        await reopened?.close();
        await archive.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("path/stream additions, exclusive extraction and stream archive cleanup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stormlib-test-"));
    const path = join(directory, "archive.mpq");
    const archive = await Archive.create(path);
    let streamed;
    try {
        const inputPath = join(directory, "input.txt");
        await writeFile(inputPath, "disk input");
        await archive.add(inputPath);
        await archive.add(Readable.from([Buffer.from("stream input")]), { archivePath: "dir/stream.txt" });
        await archive.save();
        const target = join(directory, "output", "file.txt");
        await archive.extract("dir/stream.txt", target);
        assert.equal(await readFile(target, "utf8"), "stream input");
        await assert.rejects(archive.extract("input.txt", target), { code: "EEXIST" });
        assert.equal(await readFile(target, "utf8"), "stream input");
        await archive.extract("input.txt", target, { overwrite: true });
        assert.equal(await readFile(target, "utf8"), "disk input");
        await assert.rejects(archive.extract("input.txt", path, { overwrite: true }));
        await assert.rejects(archive.add(Buffer.from("bad"), { archivePath: "../bad" }), TypeError);
        await archive.close();
        streamed = await Archive.open(createReadStream(path), { tempDirectory: directory, writable: true });
        assert.equal(await streamed.readTextFile("dir/stream.txt"), "stream input");
        await streamed.add(Buffer.from("new"), { archivePath: "new.txt" });
        const copied = join(directory, "saved.mpq");
        await streamed.save(copied);
        const saved = await Archive.open(copied);
        try { assert.equal(await saved.readTextFile("new.txt"), "new"); }
        finally { await saved.close(); }
        await streamed.close();
        assert.equal((await readdir(directory)).some(name => name.startsWith("node-stormlib-")), false);
    } finally {
        await streamed?.close();
        await archive.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test("queued operations drain before close and multiple archives are independent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stormlib-test-"));
    const first = await Archive.create(join(directory, "first.mpq"));
    const second = await Archive.create(join(directory, "second.mpq"));
    try {
        await Promise.all([
            first.add(Buffer.from("first"), { archivePath: "same" }),
            second.add(Buffer.from("second"), { archivePath: "same" }),
        ]);
        assert.deepEqual(await Promise.all([first.readTextFile("same"), second.readTextFile("same")]), ["first", "second"]);
        await assert.rejects(first.add(Buffer.from("duplicate"), { archivePath: "same" }));
        const work = first.add(Readable.from([Buffer.from("replacement")]), { archivePath: "same", replace: true });
        const reading = first.readTextFile("same");
        const closing = first.close();
        await work;
        assert.equal(await reading, "replacement");
        await closing;
        await assert.rejects(first.list(), /closed/);
        await first.close();
        await assert.rejects(Archive.create(join(directory, "first.mpq")), { code: "EEXIST" });
        await assert.rejects(Archive.open(Readable.from([Buffer.from("invalid")]), { tempDirectory: directory }));
        assert.equal((await readdir(directory)).some(name => name.startsWith("node-stormlib-")), false);
    } finally {
        await first.close();
        await second.close();
        await rm(directory, { recursive: true, force: true });
    }
});
