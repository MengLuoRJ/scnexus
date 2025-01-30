import { app } from "electron";
import sevenZipBin from "7z-bin";
import { access } from "node:fs/promises";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { Readable } from "node:stream";

export type SevenZipCompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SevenZipProgress = {
  percent: number;
  file?: string;
};

export type SevenZipResult = {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type SevenZipEntry = {
  path: string;
  size?: number;
  packedSize?: number;
  modified?: Date;
  attributes?: string;
  crc?: string;
  method?: string;
  isDirectory: boolean;
  properties: Record<string, string>;
};

export type SevenZipListResult = SevenZipResult & {
  entries: SevenZipEntry[];
};

export type SevenZipCommonOptions = {
  password?: string;
  timeout?: number;
  cwd?: string;
  onProgress?: (progress: SevenZipProgress) => void;
};

export type SevenZipAddOptions = SevenZipCommonOptions & {
  archiveType?: string;
  compressionLevel?: SevenZipCompressionLevel;
  compressionMethod?: string;
  encryptFileNames?: boolean;
  recursive?: boolean;
  solid?: boolean;
  threads?: number;
  exclude?: string[];
};

export type SevenZipExtractOptions = SevenZipCommonOptions & {
  outputDir?: string;
  files?: string[];
  exclude?: string[];
  overwrite?: "overwrite" | "skip" | "rename" | "rename-existing";
  preservePaths?: boolean;
};

export type SevenZipListOptions = SevenZipCommonOptions & {
  files?: string[];
};

export type SevenZipWrapperOptions = {
  binaryPath?: string;
};

export class SevenZipError extends Error {
  readonly result?: SevenZipResult;

  constructor(message: string, result?: SevenZipResult) {
    super(message);
    this.name = "SevenZipError";
    this.result = result;
  }
}

export class SevenZipWrapper {
  readonly binaryPath: string;

  constructor(options: SevenZipWrapperOptions = {}) {
    this.binaryPath = options.binaryPath ?? resolveBundledBinaryPath();
  }

  async add(
    archive: string,
    files: string | string[],
    options: SevenZipAddOptions = {},
  ): Promise<SevenZipResult> {
    const args = [
      "a",
      archive,
      ...toArray(files),
      ...buildCommonSwitches(options),
    ];

    if (options.archiveType) args.push(`-t${options.archiveType}`);
    if (options.compressionLevel !== undefined)
      args.push(`-mx=${options.compressionLevel}`);
    if (options.compressionMethod)
      args.push(`-m0=${options.compressionMethod}`);
    if (options.encryptFileNames) args.push("-mhe=on");
    if (options.recursive !== false) args.push("-r");
    if (options.solid !== undefined)
      args.push(`-ms=${options.solid ? "on" : "off"}`);
    if (options.threads !== undefined) args.push(`-mmt=${options.threads}`);
    appendPatterns(args, "-x!", options.exclude);

    return this.run(args, options);
  }

  async extract(
    archive: string,
    options: SevenZipExtractOptions = {},
  ): Promise<SevenZipResult> {
    await assertPathExists(archive);
    const command = options.preservePaths === false ? "e" : "x";
    const args = [command, archive, ...buildCommonSwitches(options), "-y"];

    if (options.outputDir) args.push(`-o${options.outputDir}`);
    args.push(overwriteSwitch(options.overwrite));
    appendPatterns(args, "-i!", options.files);
    appendPatterns(args, "-x!", options.exclude);

    return this.run(args, options);
  }

  async list(
    archive: string,
    options: SevenZipListOptions = {},
  ): Promise<SevenZipListResult> {
    await assertPathExists(archive);
    const args = ["l", archive, "-slt", ...buildCommonSwitches(options)];
    appendPatterns(args, "-i!", options.files);
    const result = await this.run(args, options);

    return {
      ...result,
      entries: parseTechnicalList(result.stdout, archive),
    };
  }

  async test(
    archive: string,
    options: SevenZipCommonOptions = {},
  ): Promise<SevenZipResult> {
    await assertPathExists(archive);
    return this.run(["t", archive, ...buildCommonSwitches(options)], options);
  }

  async delete(
    archive: string,
    files: string | string[],
    options: SevenZipCommonOptions = {},
  ): Promise<SevenZipResult> {
    await assertPathExists(archive);
    return this.run(
      ["d", archive, ...toArray(files), ...buildCommonSwitches(options)],
      options,
    );
  }

  async rename(
    archive: string,
    pairs: ReadonlyArray<readonly [source: string, destination: string]>,
    options: SevenZipCommonOptions = {},
  ): Promise<SevenZipResult> {
    await assertPathExists(archive);
    const names = pairs.flatMap(([source, destination]) => [
      source,
      destination,
    ]);
    return this.run(
      ["rn", archive, ...names, ...buildCommonSwitches(options)],
      options,
    );
  }

  async hash(
    files: string | string[],
    algorithm = "SHA256",
    options: SevenZipCommonOptions = {},
  ): Promise<SevenZipResult> {
    return this.run(
      [
        "h",
        ...toArray(files),
        `-scrc${algorithm}`,
        ...buildCommonSwitches(options),
      ],
      options,
    );
  }

  extractToStream(
    archive: string,
    file: string,
    options: SevenZipCommonOptions = {},
  ): Readable {
    const child = this.spawn(
      ["x", archive, file, "-so", ...buildCommonSwitches(options)],
      options,
    );
    child.stderr.on("data", () => undefined);
    return child.stdout;
  }

  async extractToBuffer(
    archive: string,
    file: string,
    options: SevenZipCommonOptions = {},
  ): Promise<Buffer> {
    await assertPathExists(archive);
    const stream = this.extractToStream(archive, file, options);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private run(
    args: string[],
    options: SevenZipCommonOptions,
  ): Promise<SevenZipResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(args, options);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let timedOut = false;
      const timeout = options.timeout
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, options.timeout)
        : undefined;

      child.stdout.on("data", (chunk: Buffer) => {
        stdout.push(chunk);
        parseProgress(chunk.toString("utf8"), options.onProgress);
      });
      child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
      child.on("error", (error) => {
        if (timeout) clearTimeout(timeout);
        reject(new SevenZipError(`Failed to start 7-Zip: ${error.message}`));
      });
      child.on("close", (exitCode) => {
        if (timeout) clearTimeout(timeout);
        const result: SevenZipResult = {
          command: this.binaryPath,
          args: [...args],
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        };

        if (timedOut) {
          reject(
            new SevenZipError(
              `7-Zip timed out after ${options.timeout}ms`,
              result,
            ),
          );
        } else if (result.exitCode === 0 || result.exitCode === 1) {
          resolve(result);
        } else {
          reject(new SevenZipError(errorMessage(result), result));
        }
      });
    });
  }

  private spawn(
    args: string[],
    options: SevenZipCommonOptions,
  ): ChildProcessWithoutNullStreams {
    return spawn(this.binaryPath, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
}

export const sevenZip = new SevenZipWrapper();

function resolveBundledBinaryPath(): string {
  const binaryPath = sevenZipBin.path7z;
  return app.isPackaged || process.env.NODE_ENV === "production"
    ? binaryPath.replace("app.asar", "app.asar.unpacked")
    : binaryPath;
}

function buildCommonSwitches(options: SevenZipCommonOptions): string[] {
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

function parseProgress(
  output: string,
  callback?: SevenZipCommonOptions["onProgress"],
) {
  if (!callback) return;
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/(\d+)%\s+(.*)?$/);
    if (match) callback({ percent: Number(match[1]), file: match[2]?.trim() });
  }
}

function parseTechnicalList(output: string, archive: string): SevenZipEntry[] {
  const blocks = output.split(/\r?\n\r?\n/);
  const entries: SevenZipEntry[] = [];

  for (const block of blocks) {
    const properties = Object.fromEntries(
      block
        .split(/\r?\n/)
        .map((line) => line.match(/^([^=]+?)\s*=\s*(.*)$/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => [match[1].trim(), match[2].trim()]),
    );
    const path = properties.Path;
    if (!path || path === archive || properties.Type) continue;
    entries.push({
      path,
      size: parseOptionalNumber(properties.Size),
      packedSize: parseOptionalNumber(properties["Packed Size"]),
      modified: parseOptionalDate(properties.Modified),
      attributes: properties.Attributes,
      crc: properties.CRC,
      method: properties.Method,
      isDirectory:
        properties.Folder === "+" ||
        properties.Attributes?.startsWith("D") === true,
      properties,
    });
  }

  return entries;
}

function parseOptionalNumber(value?: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function errorMessage(result: SevenZipResult): string {
  const output = result.stderr.trim() || result.stdout.trim();
  return output || `7-Zip exited with code ${result.exitCode}`;
}

function toArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

async function assertPathExists(path: string) {
  try {
    await access(path);
  } catch {
    throw new SevenZipError(`Path does not exist: ${path}`);
  }
}
