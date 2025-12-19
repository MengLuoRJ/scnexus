import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { hashString, MPQ_HASH, MPQ_TABLE_KEYS } from "./crypto";
import {
  createMpq,
  openMpq,
  MpqFileNotFoundError,
  MpqReadOnlyError,
} from "./index";

test("MPQ table keys match known constants", () => {
  assert.equal(
    hashString("(hash table)", MPQ_HASH.FILE_KEY),
    MPQ_TABLE_KEYS.HASH_TABLE,
  );
  assert.equal(
    hashString("(block table)", MPQ_HASH.FILE_KEY),
    MPQ_TABLE_KEYS.BLOCK_TABLE,
  );
});

test("path and stream inputs preserve encrypted, compressed and raw files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scnexus-mpq-test-"));
  const path = join(directory, "archive.mpq");
  const userData = Buffer.from("SC2 user data");
  const archive = await createMpq(path, { userData });
  try {
    const sourcePath = join(directory, "source.txt");
    await writeFile(sourcePath, "from disk");
    await archive.add(sourcePath, { archivePath: "disk.txt", compress: false });
    await archive.add(Buffer.from("hello".repeat(1000)), {
      archivePath: "dir/encrypted.txt",
      encrypt: true,
    });
    await archive.add(Readable.from([Buffer.from([0, 1, 2, 255])]), {
      archivePath: "raw.bin",
      compress: false,
      encrypt: true,
    });
    await archive.add(Buffer.alloc(0), { archivePath: "empty.bin" });
    await archive.save();
    assert.equal(archive.fileCount, 5);
    assert.equal(archive.info.hasUserData, true);
    const diskBytes = await readFile(path);
    assert.deepEqual(diskBytes.subarray(16, 16 + userData.length), userData);
    assert.equal(
      await archive.readTextFile("DIR/encrypted.txt"),
      "hello".repeat(1000),
    );
    assert.equal(await archive.readTextFile("disk.txt"), "from disk");
    assert.deepEqual(
      await archive.readFile("raw.bin"),
      Buffer.from([0, 1, 2, 255]),
    );
    assert.equal((await archive.readFile("empty.bin")).length, 0);
    await assert.rejects(
      archive.readFile("dir/encrypted.txt", { maxBytes: 10 }),
      RangeError,
    );
    assert.equal(
      (await archive.listTree()).children?.find((node) => node.name === "dir")
        ?.children?.length,
      1,
    );
    const destination = join(directory, "extracted", "file.txt");
    await archive.extract("disk.txt", destination);
    assert.equal(await readFile(destination, "utf8"), "from disk");
    await assert.rejects(archive.extract("disk.txt", destination));
    await archive.extract("disk.txt", destination, { overwrite: true });
    await archive.close();
    const streamArchive = await openMpq(createReadStream(path), {
      tempDirectory: directory,
    });
    try {
      assert.equal(
        await streamArchive.readTextFile("dir/encrypted.txt"),
        "hello".repeat(1000),
      );
      await assert.rejects(streamArchive.delete("disk.txt"), MpqReadOnlyError);
    } finally {
      await streamArchive.close();
    }
    assert.equal(
      (await readdir(directory)).some((name) =>
        name.startsWith("scnexus-mpq-"),
      ),
      false,
    );
  } finally {
    await archive.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("replacement, chained rename and deletion agree before and after save", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scnexus-mpq-test-"));
  const archive = await createMpq(join(directory, "archive.mpq"));
  try {
    await archive.add(Buffer.from("original"), { archivePath: "a" });
    await archive.save();
    const count = archive.fileCount;
    await archive.add(Buffer.from("replacement"), {
      archivePath: "a",
      replace: true,
    });
    assert.equal(archive.fileCount, count);
    await archive.save();
    await archive.rename("a", "b");
    assert.equal(await archive.hasFile("a"), false);
    await assert.rejects(archive.readFile("a"), MpqFileNotFoundError);
    await archive.rename("b", "c");
    assert.equal(await archive.readTextFile("c"), "replacement");
    await archive.save();
    assert.equal(await archive.hasFile("a"), false);
    assert.equal(await archive.hasFile("b"), false);
    assert.equal(await archive.readTextFile("c"), "replacement");
    await archive.rename("c", "d");
    await archive.delete("d");
    await archive.save();
    assert.equal(await archive.hasFile("c"), false);
    assert.equal(await archive.hasFile("d"), false);
    await archive.add(Buffer.from("one"), { archivePath: "x" });
    await archive.save();
    await archive.add(Buffer.from("two"), { archivePath: "x", replace: true });
    await archive.delete("x");
    await archive.save();
    assert.equal(await archive.hasFile("x"), false);
    await archive.add(Buffer.from("one"), { archivePath: "x" });
    await archive.save();
    await archive.add(Buffer.from("two"), { archivePath: "x", replace: true });
    await archive.rename("x", "y");
    assert.equal(await archive.hasFile("x"), false);
    await archive.save();
    assert.equal(await archive.hasFile("x"), false);
    assert.equal(await archive.readTextFile("y"), "two");
    await archive.rename("y", "z");
    await archive.add(Buffer.from("three"), { archivePath: "y" });
    assert.equal(await archive.readTextFile("z"), "two");
    await archive.save();
    assert.equal(await archive.readTextFile("z"), "two");
    assert.equal(await archive.readTextFile("y"), "three");
    assert.equal(
      archive.fileCount,
      (await archive.list()).filter((entry) => entry.isFile).length,
    );
  } finally {
    await archive.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid stream archives clean up temporary storage", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scnexus-mpq-test-"));
  try {
    await assert.rejects(
      openMpq(Readable.from([Buffer.from("invalid")]), {
        tempDirectory: directory,
      }),
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
