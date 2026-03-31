import { Worker } from "node:worker_threads";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { link, mkdir, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const Locale = {
  ALL: 0xffffffff, NONE: 0, ENUS: 0x02, KOKR: 0x04, FRFR: 0x10,
  DEDE: 0x20, ZHCN: 0x40, ESES: 0x80, ZHTW: 0x100, ENGB: 0x200,
  ESMX: 0x1000, RURU: 0x2000, PTBR: 0x4000, ITIT: 0x8000, PTPT: 0x10000,
} as const;

export interface OpenOptions {
  locale?: number;
  product?: string;
  region?: string;
  allowDownload?: boolean;
}
export interface ReadOptions {
  locale?: number;
  strict?: boolean;
  maxBytes?: number;
}
export type FileReference = string | number | { contentKey: string } | { encodedKey: string };
export interface StorageInfo {
  localFileCount: number;
  totalFileCount: number;
  features: number;
  product: string;
  buildNumber: number;
}
export interface FileEntry {
  name: string;
  size: number;
  contentKey: string;
  encodedKey: string;
  fileDataId: number;
  locale: number;
  contentFlags: number;
  available: boolean;
  nameType: number;
}
export interface ListOptions { mask?: string; listfile?: string }
export interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  entry?: FileEntry;
  children?: TreeNode[];
}

export class CascLibError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "CascLibError";
  }
}

type Reply = { id: number; value?: unknown; error?: { message: string; name: string; code?: number } };
type Pending = { resolve(value: unknown): void; reject(error: Error): void };

export class Storage {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private readonly ready: Promise<unknown>;
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private closing = false;
  private closePromise?: Promise<void>;
  private failure?: Error;

  private constructor(readonly path: string, options: OpenOptions & { online?: boolean; localFile?: boolean }) {
    this.ready = new Promise((resolveReady, reject) => {
      this.pending.set(0, { resolve: resolveReady, reject });
    });
    this.worker = new Worker(new URL("./worker.js", import.meta.url), {
      execArgv: [],
      workerData: { path, options: {
        ...options,
        locale: uint32(options.locale ?? Locale.ALL, "locale"),
        flags: options.allowDownload ? 0x2000 : 0,
      } },
    });
    this.worker.on("message", (reply: Reply) => {
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      this.pending.delete(reply.id);
      if (reply.error) {
        const ErrorType = reply.error.name === "RangeError" ? RangeError
          : reply.error.name === "TypeError" ? TypeError : Error;
        const error = reply.error.code !== undefined
          ? new CascLibError(reply.error.message, reply.error.code)
          : Object.assign(new ErrorType(reply.error.message), { name: reply.error.name });
        pending.reject(error);
      } else pending.resolve(reply.value);
      if (!this.pending.size) this.worker.unref();
    });
    this.worker.on("error", (error) => this.fail(error));
    this.worker.on("exit", (code) => this.fail(new Error(`CascLib worker exited with code ${code}`)));
  }

  private static async start(path: string, options: OpenOptions & { online?: boolean; localFile?: boolean }): Promise<Storage> {
    text(path, "path");
    if (options.product !== undefined) text(options.product, "product");
    if (options.region !== undefined) text(options.region, "region");
    uint32(options.locale ?? Locale.ALL, "locale");
    const storage = new Storage(path, options);
    try {
      await storage.ready;
      return storage;
    } catch (error) {
      await storage.worker.terminate();
      throw error;
    }
  }

  static open(path: string, options: OpenOptions = {}): Promise<Storage> {
    return this.start(resolve(text(path, "path")), options);
  }
  static openOnline(cacheDirectory: string, options: OpenOptions & { product: string }): Promise<Storage> {
    text(options.product, "product");
    return this.start(resolve(text(cacheDirectory, "cacheDirectory")), { ...options, online: true });
  }
  static async readLocalFile(path: string, options: ReadOptions = {}): Promise<Buffer> {
    const storage = await this.start(resolve(text(path, "path")), { localFile: true });
    try { return await storage.readFile("local", options); }
    finally { await storage.close(); }
  }

  getInfo(): Promise<StorageInfo> { return this.enqueue(() => this.request("info", [])); }
  get fileCount(): Promise<number> { return this.getFileCount(); }
  async getFileCount(): Promise<number> { return (await this.getInfo()).totalFileCount; }
  hasFile(file: FileReference, options: ReadOptions = {}): Promise<boolean> {
    return this.enqueue(() => this.request("has", readArguments(file, options)));
  }
  list(options: ListOptions = {}): Promise<FileEntry[]> {
    return this.enqueue(() => this.request("list", [
      text(options.mask ?? "*", "mask"),
      options.listfile === undefined ? "" : resolve(text(options.listfile, "listfile")),
    ]));
  }
  async listTree(options: ListOptions = {}): Promise<TreeNode> {
    const root: TreeNode = { name: basename(this.path), path: "", type: "directory", children: [] };
    const directories = new Map<string, TreeNode>([["", root]]);
    for (const entry of await this.list(options)) {
      const parts = entry.name.replaceAll("\\", "/").split("/");
      let parent = root;
      let path = "";
      for (const part of parts.slice(0, -1)) {
        path = path ? `${path}/${part}` : part;
        const key = path.toUpperCase();
        let directory = directories.get(key);
        if (!directory) {
          directory = { name: part, path, type: "directory", children: [] };
          directories.set(key, directory);
          parent.children!.push(directory);
        }
        parent = directory;
      }
      parent.children!.push({ name: parts.at(-1)!, path: parts.join("/"), type: "file", entry });
    }
    const sort = (node: TreeNode): void => {
      node.children?.sort((left, right) => Number(right.type === "directory") - Number(left.type === "directory") || left.name.localeCompare(right.name));
      node.children?.forEach(sort);
    };
    sort(root);
    return root;
  }
  readFile(file: FileReference, options: ReadOptions = {}): Promise<Buffer> {
    return this.enqueue(async () => Buffer.from(await this.request<Uint8Array>("read", [
      ...readArguments(file, options), uint32(options.maxBytes ?? 256 * 1024 * 1024, "maxBytes"),
    ])));
  }
  async readTextFile(file: FileReference, encoding: BufferEncoding = "utf8", options: ReadOptions = {}): Promise<string> {
    return (await this.readFile(file, options)).toString(encoding);
  }
  extract(file: FileReference, destination: string, options: ReadOptions & { overwrite?: boolean } = {}): Promise<void> {
    return this.enqueue(async () => {
      const target = resolve(text(destination, "destination"));
      const difference = relative(this.path, target);
      if (!difference || (difference !== ".." && !difference.startsWith(`..${sep}`) && !isAbsolute(difference)))
        throw new Error("Cannot extract into the open storage");
      await mkdir(dirname(target), { recursive: true });
      const temporary = join(dirname(target), `.${randomUUID()}.extract`);
      try {
        await this.request("extract", [...readArguments(file, options), temporary]);
        if (options.overwrite) await rename(temporary, target);
        else await link(temporary, target);
      } finally { await rm(temporary, { force: true }); }
    });
  }
  addEncryptionKey(name: bigint, key: string): Promise<void> {
    return this.enqueue(() => {
      if (typeof name !== "bigint" || name < 0n || name > 0xffffffffffffffffn) throw new RangeError("Key name must be a uint64 bigint");
      return this.request("key", [name, hexKey(key)]);
    });
  }
  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.queue.then(async () => {
      try { await this.request("close", []); }
      finally { await this.worker.terminate(); }
    });
    return this.closePromise;
  }
  private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (this.closing) return Promise.reject(new Error("Storage is closing or closed"));
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }
  private request<Result>(operation: string, args: unknown[]): Promise<Result> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolveReply, reject) => {
      const id = ++this.sequence;
      this.pending.set(id, { resolve: (value) => resolveReply(value as Result), reject });
      this.worker.ref();
      try { this.worker.postMessage({ id, operation, args }); }
      catch (error) {
        this.pending.delete(id);
        reject(error);
        if (!this.pending.size) this.worker.unref();
      }
    });
  }
  private fail(error: Error): void {
    this.failure = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

function text(value: string, label: string): string {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new TypeError(`${label} must be nonempty and contain no NUL`);
  return value;
}
function uint32(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError(`${label} must be uint32`);
  return value;
}
function hexKey(value: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{32}$/i.test(value)) throw new TypeError("Expected a 32-character hexadecimal key");
  return value;
}
function readArguments(file: FileReference, options: ReadOptions): unknown[] {
  let selector: { type: string; value: string | number };
  if (typeof file === "string") selector = { type: "name", value: text(file, "file").replaceAll("/", "\\") };
  else if (typeof file === "number") selector = { type: "id", value: uint32(file, "fileDataId") };
  else if (file && "contentKey" in file) selector = { type: "ckey", value: hexKey(file.contentKey) };
  else if (file && "encodedKey" in file) selector = { type: "ekey", value: hexKey(file.encodedKey) };
  else throw new TypeError("Invalid CASC file reference");
  return [selector, uint32(options.locale ?? Locale.ALL, "locale"), options.strict ? 0x10 : 0];
}