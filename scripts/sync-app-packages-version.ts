#!/usr/bin/env tsx

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const mainJsonFile = await readFile("./package.json", { encoding: "utf8" });
const { version } = JSON.parse(mainJsonFile);

console.log("# Syncing App Packages Version to", version);

const appPackages = [
  {
    name: "@scnexus/app-main",
    path: "packages/app-main",
  },
  {
    name: "@scnexus/app-preload",
    path: "packages/app-preload",
  },
  {
    name: "@scnexus/app-renderer",
    path: "packages/app-renderer",
  },
  {
    name: "@scnexus/app-shared",
    path: "packages/app-shared",
  },
];

for (const { name, path } of appPackages) {
  const packagePath = resolve(__dirname, "../", path);
  const packageJsonFile = await readFile(join(packagePath, "package.json"), {
    encoding: "utf8",
  });

  const packageJson = JSON.parse(packageJsonFile);
  if (packageJson.name === name) {
    console.log("\t-", name, packageJson.version, "->", version);
    packageJson.version = version;
    await writeFile(
      join(packagePath, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );
  }
}
