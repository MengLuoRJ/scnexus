import type { Readable } from "node:stream";
import { assertPathExists, parseTechnicalList, SevenZipRunner } from "./runner";
import type {
  SevenZipAddOptions,
  SevenZipCommonOptions,
  SevenZipExtractOptions,
  SevenZipListOptions,
  SevenZipListResult,
  SevenZipRenamePair,
  SevenZipResult,
} from "./types";

export function createCommands(runner: SevenZipRunner) {
  return {
    add: (
      archive: string,
      files: string | string[],
      options?: SevenZipAddOptions,
    ) => add(runner, archive, files, options),
    extract: (archive: string, options?: SevenZipExtractOptions) =>
      extract(runner, archive, options),
    list: (archive: string, options?: SevenZipListOptions) =>
      list(runner, archive, options),
    test: (archive: string, options?: SevenZipCommonOptions) =>
      test(runner, archive, options),
    delete: (
      archive: string,
      files: string | string[],
      options?: SevenZipCommonOptions,
    ) => deleteFiles(runner, archive, files, options),
    rename: (
      archive: string,
      pairs: ReadonlyArray<SevenZipRenamePair>,
      options?: SevenZipCommonOptions,
    ) => rename(runner, archive, pairs, options),
    hash: (
      files: string | string[],
      algorithm?: string,
      options?: SevenZipCommonOptions,
    ) => hash(runner, files, algorithm, options),
    extractToStream: (
      archive: string,
      file: string,
      options?: SevenZipCommonOptions,
    ) => extractToStream(runner, archive, file, options),
    extractToBuffer: (
      archive: string,
      file: string,
      options?: SevenZipCommonOptions,
    ) => extractToBuffer(runner, archive, file, options),
  };
}

export async function add(
  runner: SevenZipRunner,
  archive: string,
  files: string | string[],
  options: SevenZipAddOptions = {},
): Promise<SevenZipResult> {
  const args = ["a", archive, ...toArray(files), ...commonSwitches(options)];
  if (options.archiveType) args.push(`-t${options.archiveType}`);
  if (options.compressionLevel !== undefined)
    args.push(`-mx=${options.compressionLevel}`);
  if (options.compressionMethod) args.push(`-m0=${options.compressionMethod}`);
  if (options.encryptFileNames) args.push("-mhe=on");
  if (options.recursive !== false) args.push("-r");
  if (options.solid !== undefined)
    args.push(`-ms=${options.solid ? "on" : "off"}`);
  if (options.threads !== undefined) args.push(`-mmt=${options.threads}`);
  appendPatterns(args, "-x!", options.exclude);
  return runner.run(args, options);
}

export async function extract(
  runner: SevenZipRunner,
  archive: string,
  options: SevenZipExtractOptions = {},
): Promise<SevenZipResult> {
  await assertPathExists(archive);
  const args = [
    options.preservePaths === false ? "e" : "x",
    archive,
    ...commonSwitches(options),
    "-y",
  ];
  if (options.outputDir) args.push(`-o${options.outputDir}`);
  args.push(overwriteSwitch(options.overwrite));
  appendPatterns(args, "-i!", options.files);
  appendPatterns(args, "-x!", options.exclude);
  return runner.run(args, options);
}

export async function list(
  runner: SevenZipRunner,
  archive: string,
  options: SevenZipListOptions = {},
): Promise<SevenZipListResult> {
  await assertPathExists(archive);
  const args = ["l", archive, "-slt", ...commonSwitches(options)];
  appendPatterns(args, "-i!", options.files);
  const result = await runner.run(args, options);
  return { ...result, entries: parseTechnicalList(result.stdout, archive) };
}

export async function test(
  runner: SevenZipRunner,
  archive: string,
  options: SevenZipCommonOptions = {},
): Promise<SevenZipResult> {
  await assertPathExists(archive);
  return runner.run(["t", archive, ...commonSwitches(options)], options);
}

export async function deleteFiles(
  runner: SevenZipRunner,
  archive: string,
  files: string | string[],
  options: SevenZipCommonOptions = {},
): Promise<SevenZipResult> {
  await assertPathExists(archive);
  return runner.run(
    ["d", archive, ...toArray(files), ...commonSwitches(options)],
    options,
  );
}

export async function rename(
  runner: SevenZipRunner,
  archive: string,
  pairs: ReadonlyArray<SevenZipRenamePair>,
  options: SevenZipCommonOptions = {},
): Promise<SevenZipResult> {
  await assertPathExists(archive);
  const names = pairs.flatMap(([source, destination]) => [source, destination]);
  return runner.run(
    ["rn", archive, ...names, ...commonSwitches(options)],
    options,
  );
}

export function hash(
  runner: SevenZipRunner,
  files: string | string[],
  algorithm = "SHA256",
  options: SevenZipCommonOptions = {},
): Promise<SevenZipResult> {
  return runner.run(
    ["h", ...toArray(files), `-scrc${algorithm}`, ...commonSwitches(options)],
    options,
  );
}

export function extractToStream(
  runner: SevenZipRunner,
  archive: string,
  file: string,
  options: SevenZipCommonOptions = {},
): Readable {
  const child = runner.spawn(
    ["x", archive, file, "-so", ...commonSwitches(options)],
    options,
  );
  child.stderr.on("data", () => undefined);
  return child.stdout;
}

export async function extractToBuffer(
  runner: SevenZipRunner,
  archive: string,
  file: string,
  options: SevenZipCommonOptions = {},
): Promise<Buffer> {
  await assertPathExists(archive);
  const chunks: Buffer[] = [];
  for await (const chunk of extractToStream(runner, archive, file, options)) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function commonSwitches(options: SevenZipCommonOptions): string[] {
  const switches = ["-bsp1"];
  if (options.password) switches.push(`-p${options.password}`);
  return switches;
}

function appendPatterns(
  args: string[],
  prefix: "-i!" | "-x!",
  patterns?: string[],
) {
  for (const pattern of patterns ?? []) args.push(`${prefix}${pattern}`);
}

function overwriteSwitch(mode: SevenZipExtractOptions["overwrite"]): string {
  switch (mode) {
    case "skip":
      return "-aos";
    case "rename":
      return "-aou";
    case "rename-existing":
      return "-aot";
    default:
      return "-aoa";
  }
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}
