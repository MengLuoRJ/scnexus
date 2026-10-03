import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "vendor", "CascLib");
const revision = "2a280f5a231966dc5d1b534978dd9f9f04a374cd";
function git(args, cwd) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr || "git failed");
    return result.stdout.trim();
}

await mkdir(dirname(destination), { recursive: true });
const source = process.env.CASCLIB_SOURCE_DIR;
if (source) {
    const path = resolve(source);
    if (path === destination) throw new Error("CASCLIB_SOURCE_DIR must not be the generated vendor directory");
    if (git(["rev-parse", "HEAD"], path) !== revision) throw new Error("CascLib source revision does not match the pinned revision");
    if (git(["status", "--porcelain"], path)) throw new Error("CascLib source must have no modifications or untracked files");
    await rm(destination, { recursive: true, force: true });
    await cp(path, destination, { recursive: true, filter: (entry) => entry !== join(path, ".git") });
} else {
    try {
        if (await readFile(join(destination, ".source-revision"), "utf8") !== revision) throw new Error("Revision changed");
        if (git(["rev-parse", "HEAD"], destination) !== revision) throw new Error("Cached source revision changed");
        if (git(["status", "--porcelain", "--untracked-files=no"], destination)) throw new Error("Cached sources changed");
    } catch {
        await rm(destination, { recursive: true, force: true });
        await mkdir(destination, { recursive: true });
        git(["init", "--quiet"], destination);
        git(["remote", "add", "origin", "https://github.com/ladislav-zezula/CascLib.git"], destination);
        git(["fetch", "--depth=1", "origin", revision], destination);
        git(["checkout", "--detach", "FETCH_HEAD"], destination);
    }
}
await writeFile(join(destination, ".source-revision"), revision);
for (const file of ["LICENSE", "src/zlib/zlib.h"]) {
    const target = join(root, "dist", "licenses", "CascLib", file);
    await mkdir(dirname(target), { recursive: true });
    await cp(join(destination, file), target);
}
console.log(`Prepared CascLib ${revision}`);
