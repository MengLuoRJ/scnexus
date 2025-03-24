import { app } from "electron";
import sevenZipBin from "7z-bin";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { access } from "node:fs/promises";
import {
  createSevenZipError,
  SevenZipError,
  SevenZipPathError,
  SevenZipTimeoutError,
} from "./errors";
import type {
  SevenZipCommonOptions,
  SevenZipEntry,
  SevenZipResult,
} from "./types";

export class SevenZipRunner {
  readonly binaryPath: string;

  constructor(binaryPath = resolveBundledBinaryPath()) {
    this.binaryPath = binaryPath;
  }

  spawn(
    args: string[],
    options: SevenZipCommonOptions = {},
  ): ChildProcessWithoutNullStreams {
    try {
      return spawn(this.binaryPath, args, {
        cwd: options.cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      throw new SevenZipError(
        `Failed to start 7-Zip: ${(error as Error).message}`,
      );
    }
  }

  run(
    args: string[],
    options: SevenZipCommonOptions = {},
  ): Promise<SevenZipResult> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(args, options);
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let timedOut = false;
      let settled = false;
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
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        reject(new SevenZipError(`Failed to start 7-Zip: ${error.message}`));
      });
      child.on("close", (exitCode) => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        const result: SevenZipResult = {
          command: this.binaryPath,
          args: [...args],
          exitCode: exitCode ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        };

        if (timedOut) {
          reject(new SevenZipTimeoutError(options.timeout ?? 0, result));
        } else if (result.exitCode === 0 || result.exitCode === 1) {
          resolve(result);
        } else {
          reject(createSevenZipError(result));
        }
      });
    });
  }
}

export function resolveBundledBinaryPath(): string {
  const binaryPath = sevenZipBin.path7z;
  return app.isPackaged || process.env.NODE_ENV === "production"
    ? binaryPath.replace("app.asar", "app.asar.unpacked")
    : binaryPath;
}

export async function assertPathExists(path: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new SevenZipPathError(path);
  }
}

export function parseTechnicalList(
  output: string,
  archive: string,
): SevenZipEntry[] {
  const entries: SevenZipEntry[] = [];
  for (const block of output.split(/\r?\n\r?\n/)) {
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
