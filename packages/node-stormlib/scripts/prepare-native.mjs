import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "vendor", "StormLib");
const revision = "44ebfbfc109d76e2a85bbd5d8b0c949df7e65c6f";
function git(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || "git failed");
  return result.stdout.trim();
}

await mkdir(dirname(destination), { recursive: true });
const source = process.env.STORMLIB_SOURCE_DIR;
if (source) {
  const path = resolve(source);
  if (path === destination) throw new Error("STORMLIB_SOURCE_DIR must not be the generated vendor directory");
  if (git(["rev-parse", "HEAD"], path) !== revision) throw new Error("StormLib source revision does not match the pinned revision");
  if (git(["status", "--porcelain"], path)) throw new Error("StormLib source must have no modifications or untracked files");
  await rm(destination, { recursive: true, force: true });
  await cp(path, destination, { recursive: true, filter: (entry) => entry !== join(path, ".git") });
} else {
  try {
    const marker = await readFile(join(destination, ".source-revision"), "utf8");
    if (marker !== revision) throw new Error("Revision changed");
    if (git(["rev-parse", "HEAD"], destination) !== revision) throw new Error("Cached source revision changed");
    if (git(["status", "--porcelain", "--untracked-files=no"], destination)) throw new Error("Cached sources changed");
  } catch {
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    git(["init", "--quiet"], destination);
    git(["remote", "add", "origin", "https://github.com/ladislav-zezula/StormLib.git"], destination);
    git(["fetch", "--depth=1", "origin", revision], destination);
    git(["checkout", "--detach", "FETCH_HEAD"], destination);
  }
}
await writeFile(join(destination, ".source-revision"), revision);
for (const file of ["LICENSE", "src/zlib/zlib.h", "src/bzip2/bzlib.h"]) {
  const target = join(root, "dist", "licenses", "StormLib", file);
  await mkdir(dirname(target), { recursive: true });
  await cp(join(destination, file), target);
}
console.log(`Prepared StormLib ${revision}`);
