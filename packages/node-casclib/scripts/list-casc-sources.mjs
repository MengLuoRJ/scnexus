import { readFileSync } from "node:fs";
const configuration = JSON.parse(readFileSync(new URL("../binding.gyp", import.meta.url), "utf8"));
console.log(configuration.targets[0].sources.filter((source) => source.startsWith("vendor/")).join(" "));
