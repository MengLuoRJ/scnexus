import { lstat, readdir, readFile } from "node:fs/promises";
import { join, basename } from "node:path";
import type {
  FileTree,
  SourceInput,
} from "@scnexus/app-shared/types/content.type";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import { sevenZip } from "../../utils/7zip-wrapper";
import { logicalPath, keyPath, safePath } from "./paths";
export type Entry = { path: string; bytes: number; modifiedAt: number | null };
export type ContentSource = {
  input: SourceInput;
  entries: Entry[];
  tree: FileTree;
  read(path: string): Promise<Buffer>;
};
export function makeTree(entries: Entry[], name: string): FileTree {
  const root: FileTree = {
    name,
    path: "",
    modifiedAt: null,
    bytes: 0,
    kind: "directory",
    children: [],
  };
  for (const entry of entries) {
    let parent = root;
    root.bytes += entry.bytes;
    const parts = entry.path.split("/");
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join("/");
      let child = parent.children!.find((item) => item.path === path);
      if (!child) {
        child = {
          name: parts[i],
          path,
          bytes: 0,
          modifiedAt: null,
          kind: i === parts.length - 1 ? "file" : "directory",
          ...(i === parts.length - 1 ? {} : { children: [] }),
        };
        parent.children!.push(child);
      }
      child.bytes += entry.bytes;
      if (child.kind === "file") child.modifiedAt = entry.modifiedAt;
      parent = child;
    }
  }
  return root;
}
export async function openSource(input: SourceInput): Promise<ContentSource> {
  if (
    !input ||
    !["archive", "directory"].includes(input.kind) ||
    typeof input.path !== "string"
  )
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
  const info = await lstat(input.path);
  if (
    info.isSymbolicLink() ||
    (input.kind === "directory" ? !info.isDirectory() : !info.isFile())
  )
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
  let entries: Entry[] = [];
  let read: ContentSource["read"];
  if (input.kind === "directory") {
    const walk = async (dir: string, prefix = "") => {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + item.name;
        const absolute = await safePath(input.path, path);
        const stat = await lstat(absolute);
        if (stat.isDirectory()) await walk(absolute, path + "/");
        else if (stat.isFile())
          entries.push({ path, bytes: stat.size, modifiedAt: stat.mtimeMs });
        else throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
      }
    };
    await walk(input.path);
    read = async (path) => readFile(await safePath(input.path, path));
  } else {
    const result = await sevenZip.list(input.path);
    for (const entry of result.entries) {
      const path = logicalPath(entry.path);
      if (entry.attributes?.includes("L"))
        throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
      if (!entry.isDirectory)
        entries.push({
          path,
          bytes: entry.size ?? 0,
          modifiedAt: entry.modified?.getTime() ?? null,
        });
    }
    read = (path) =>
      sevenZip.readFile(input.path, path, {
        maxBytes: 512 * 1024 * 1024,
        timeout: 120000,
      });
  }
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(keyPath(entry.path)))
      throw new AppError(ERRORS.ARCHIVE_INVALID, {
        message: "Duplicate archive path",
      });
    seen.add(keyPath(entry.path));
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    input,
    entries,
    read,
    tree: makeTree(entries, basename(input.path)),
  };
}
