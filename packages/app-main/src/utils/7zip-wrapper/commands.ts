import { basename } from "node:path";
import { PassThrough, type Readable } from "node:stream";
import {
  createSevenZipError,
  SevenZipError,
  SevenZipTimeoutError,
} from "./errors";
import { assertPathExists, parseTechnicalList, SevenZipRunner } from "./runner";
import type {
  SevenZipAddOptions,
  SevenZipCommonOptions,
  SevenZipExtractOptions,
  SevenZipListOptions,
  SevenZipListResult,
  SevenZipReadFileOptions,
  SevenZipRenamePair,
  SevenZipResult,
  SevenZipTreeNode,
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
    listTree: (archive: string, options?: SevenZipListOptions) =>
      listTree(runner, archive, options),
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
    readFile: (
      archive: string,
      file: string,
      options?: SevenZipReadFileOptions,
    ) => readFile(runner, archive, file, options),
    readTextFile: (
      archive: string,
      file: string,
      encoding?: BufferEncoding,
      options?: SevenZipReadFileOptions,
    ) => readTextFile(runner, archive, file, encoding, options),
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

export async function listTree(
  runner: SevenZipRunner,
  archive: string,
  options: SevenZipListOptions = {},
): Promise<SevenZipTreeNode> {
  const { entries } = await list(runner, archive, options);
  return buildTree(archive, entries);
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
  const output = new PassThrough();
  const stderr: Buffer[] = [];
  let timedOut = false;
  const timeout = options.timeout
    ? setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeout)
    : undefined;

  child.stdout.pipe(output, { end: false });
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.on("error", (error) => {
    if (timeout) clearTimeout(timeout);
    output.destroy(
      new SevenZipError(`Failed to start 7-Zip: ${error.message}`),
    );
  });
  child.on("close", (exitCode) => {
    if (timeout) clearTimeout(timeout);
    if (timedOut) {
      output.destroy(new SevenZipTimeoutError(options.timeout ?? 0));
    } else if (exitCode === 0 || exitCode === 1) {
      output.end();
    } else {
      output.destroy(
        createSevenZipError({
          command: runner.binaryPath,
          args: ["x", archive, file, "-so"],
          exitCode: exitCode ?? -1,
          stdout: "",
          stderr: Buffer.concat(stderr).toString("utf8"),
        }),
      );
    }
  });
  output.on("close", () => {
    if (child.exitCode === null && !child.killed) child.kill();
  });
  return output;
}

export async function extractToBuffer(
  runner: SevenZipRunner,
  archive: string,
  file: string,
  options: SevenZipCommonOptions = {},
): Promise<Buffer> {
  return readFile(runner, archive, file, options);
}

export async function readFile(
  runner: SevenZipRunner,
  archive: string,
  file: string,
  options: SevenZipReadFileOptions = {},
): Promise<Buffer> {
  await assertPathExists(archive);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of extractToStream(runner, archive, file, options)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (options.maxBytes !== undefined && size > options.maxBytes) {
      throw new SevenZipError(
        `Archive file exceeds the ${options.maxBytes} byte read limit: ${file}`,
      );
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function readTextFile(
  runner: SevenZipRunner,
  archive: string,
  file: string,
  encoding: BufferEncoding = "utf8",
  options: SevenZipReadFileOptions = {},
): Promise<string> {
  return (await readFile(runner, archive, file, options)).toString(encoding);
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

function buildTree(
  archive: string,
  entries: SevenZipListResult["entries"],
): SevenZipTreeNode {
  const root: SevenZipTreeNode = {
    name: basename(archive),
    path: "",
    type: "directory",
    children: [],
  };
  const directories = new Map<string, SevenZipTreeNode>([["", root]]);

  for (const entry of entries) {
    const path = entry.path.replaceAll("\\", "/").replace(/^\.\//, "");
    const parts = path.split("/").filter(Boolean);
    if (!parts.length) continue;
    let parent = root;
    let parentPath = "";

    for (let index = 0; index < parts.length - 1; index += 1) {
      parentPath = parentPath ? `${parentPath}/${parts[index]}` : parts[index];
      let directory = directories.get(parentPath);
      if (!directory) {
        directory = {
          name: parts[index],
          path: parentPath,
          type: "directory",
          children: [],
        };
        parent.children?.push(directory);
        directories.set(parentPath, directory);
      }
      parent = directory;
    }

    if (entry.isDirectory) {
      const existingDirectory = directories.get(path);
      if (existingDirectory) {
        existingDirectory.size = entry.size;
        existingDirectory.packedSize = entry.packedSize;
        existingDirectory.modified = entry.modified;
        continue;
      }
    }

    const node: SevenZipTreeNode = {
      name: parts.at(-1)!,
      path,
      type: entry.isDirectory ? "directory" : "file",
      size: entry.size,
      packedSize: entry.packedSize,
      modified: entry.modified,
      children: entry.isDirectory ? [] : undefined,
    };
    parent.children?.push(node);
    if (entry.isDirectory) directories.set(path, node);
  }

  sortTree(root);
  return root;
}

function sortTree(node: SevenZipTreeNode) {
  node.children?.sort(
    (left, right) =>
      Number(right.type === "directory") - Number(left.type === "directory") ||
      left.name.localeCompare(right.name),
  );
  node.children?.forEach(sortTree);
}
