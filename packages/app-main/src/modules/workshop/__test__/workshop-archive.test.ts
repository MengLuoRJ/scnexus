import { test, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
vi.mock("electron", () => ({ app: { isPackaged: false } }));
vi.mock("@/modules/window", () => ({ getMainWindow: () => null }));
import { sevenZip } from "../../../utils/7zip-wrapper";
import { writeMetadataToCompressedFile } from "../workshop-service";

test("7z workshop metadata replacement preserves archive payload and replaces nested metadata", async () => {
  const directory = await mkdtemp(join(tmpdir(), "scnexus-workshop-"));
  try {
    await mkdir(join(directory, "Nested"));
    await writeFile(
      join(directory, "Nested", "metadata.json"),
      '{"name":"old"}',
    );
    await writeFile(join(directory, "地图.SC2Map"), "payload");
    const archive = join(directory, "work.zip");
    await sevenZip.add(archive, ["Nested", "地图.SC2Map"], {
      cwd: directory,
      archiveType: "zip",
    });
    const metadata = {
      name: "新作品",
      description: "desc",
      author: "author",
      version: "1",
      type: "Customize",
    };
    await writeMetadataToCompressedFile(archive, metadata as never);
    const entries = (await sevenZip.list(archive)).entries;
    expect(
      entries
        .filter((entry) => entry.path.endsWith("metadata.json"))
        .map((entry) => entry.path),
    ).toEqual(["metadata.json"]);
    expect(
      JSON.parse(await sevenZip.readTextFile(archive, "metadata.json")),
    ).toEqual(metadata);
    expect(await sevenZip.readTextFile(archive, "地图.SC2Map")).toBe("payload");
    const first = await readFile(archive);
    await writeMetadataToCompressedFile(archive, {
      ...metadata,
      name: "updated",
    } as never);
    expect(await readFile(archive)).not.toEqual(first);
    expect(
      JSON.parse(await sevenZip.readTextFile(archive, "metadata.json")).name,
    ).toBe("updated");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
