import { fileTransaction } from "./transaction";
import { randomUUID, createHash } from "node:crypto";
import { ccmDirectoryName } from "./ccm-title";
import { readFile, writeFile, mkdir, rm, lstat, rmdir } from "node:fs/promises";
import { join, dirname, basename, relative } from "node:path";
import type {
  AnalysisResult,
  ExistingInstallation,
  SourceInput,
  ContentType,
  InstallPreview,
  Conflict,
  ConflictDecision,
  InstalledFile,
  PlannedFile,
  ContentRecord,
  GamePaths,
  Package,
  PackageCampaignType,
  RemovalPreview,
  RemovalDecision,
  ActivationPreview,
  ContentStore,
  CampaignActiveStoreData,
} from "@scnexus/app-shared/types/content.type";
import { AppError, ERRORS } from "@scnexus/app-shared/errors/app.error";
import { openSource, makeTree, type ContentSource } from "./source";
import { parsePackage, parseCcm, decodeCcm, buildPreview } from "./parser";
import {
  campaignRoots,
  CAMPAIGNS,
  safePath,
  officialMap,
  keyPath,
  logicalPath,
  below,
} from "./paths";
import { campaignRepository } from "../../stores/campaign";
import { customizeRepository } from "../../stores/customize";
import { campaignActiveRepository } from "../../stores/campaign-active";
import { getGamePaths, withGameLock } from "../scii-game-setting";
function officialScope(target: string, campaign: PackageCampaignType) {
  const path = target.toLowerCase();
  if (!path.startsWith("maps/campaign/")) return true;
  if (campaign === "WOL")
    return !/^maps\/campaign\/(swarm|void|voidprologue|nova)(\/|$)/.test(path);
  return campaignRoots[campaign].some(
    (root) =>
      path === root.toLowerCase() || path.startsWith(root.toLowerCase() + "/"),
  );
}
export function validateRecordPaths(record: ContentRecord, paths: GamePaths) {
  if (record.gameRoot !== paths.gameRoot)
    throw new AppError(ERRORS.PROFILE_CHANGE_BLOCKED);
  if (record.mode !== "scnexus" && record.mode !== "ccm")
    throw new AppError(ERRORS.STORE_DATA_INVALID);
  const expected = join(
    record.mode === "ccm" ? paths.ccmRoot : paths.customizeDataRoot,
    record.mode === "ccm"
      ? basename(record.managementDirectory)
      : record.localId,
  );
  if (record.external) {
    if (
      record.payloadDirectory !== null ||
      !below(paths.gameRoot, record.managementDirectory) ||
      !logicalPath(record.localId) ||
      record.descriptorPath !==
        join(
          record.managementDirectory,
          record.mode === "ccm" ? "metadata.txt" : "package.json",
        )
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
  } else if (
    logicalPath(record.localId).includes("/") ||
    record.managementDirectory !== expected ||
    record.descriptorPath !==
      join(expected, record.mode === "ccm" ? "metadata.txt" : "package.json") ||
    (record.payloadDirectory !== null &&
      record.payloadDirectory !==
        (record.mode === "ccm" ? expected : join(expected, "payload")))
  )
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
  for (const f of [...record.files, ...record.installedFiles]) {
    if (
      !/^(Maps|Mods)\//.test(logicalPath(f.target)) ||
      f.official !== officialMap(f.target, record.package.campaign) ||
      (record.package.campaign &&
        !officialScope(f.target, record.package.campaign))
    )
      throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
  }
}
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function existing(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
interface Index<T> {
  getSnapshot(): T;
  update(value: T): T;
}
type Context = {
  source: ContentSource;
  result: AnalysisResult;
  root: string;
  gameRevision: number;
  hashes: Map<string, string>;
  expires: number;
};
type Activation = {
  record: ContentRecord;
  preview: ActivationPreview;
  gameRevision: number;
  hashes: Map<string, string>;
  expires: number;
};
type Removal = {
  preview: RemovalPreview;
  record: ContentRecord;
  active: boolean;
  gameRevision: number;
  stamp: string;
  expires: number;
};
export class ContentService {
  private cancelled = new Set<string>();
  cancel(previewId: string) {
    if (
      !this.analyses.has(previewId) &&
      !this.activations.has(previewId) &&
      !this.removals.has(previewId)
    )
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    this.cancelled.add(previewId);
    this.analyses.delete(previewId);
    this.activations.delete(previewId);
    this.removals.delete(previewId);
    if (this.cancelled.size > 100)
      this.cancelled.delete(this.cancelled.values().next().value!);
  }
  private checkCancelled(id?: string) {
    if (id && this.cancelled.has(id))
      throw new AppError(ERRORS.TASK_CANCELLED, { taskId: id });
  }
  private operationId: string | undefined;
  private async operation<T>(id: string, run: () => Promise<T>): Promise<T> {
    return this.lock(async () => {
      this.checkCancelled(id);
      this.operationId = id;
      try {
        return await run();
      } finally {
        this.operationId = undefined;
      }
    });
  }
  private analyses = new Map<string, Context>();
  private activations = new Map<string, Activation>();
  private removals = new Map<string, Removal>();
  constructor(
    private paths: () => Promise<GamePaths>,
    private campaign: Index<ContentStore>,
    private customize: Index<ContentStore>,
    private active: Index<CampaignActiveStoreData>,
    private lock: <T>(run: () => Promise<T>) => Promise<T> = withGameLock,
  ) {}
  private index(type: ContentType) {
    return type === "campaign" ? this.campaign : this.customize;
  }
  private prune() {
    for (const map of [this.analyses, this.activations, this.removals])
      for (const [key, value] of map)
        if (value.expires < Date.now()) map.delete(key);
    if (this.analyses.size + this.activations.size + this.removals.size > 30)
      throw new AppError(ERRORS.TASK_CONFLICT, {
        message: "Too many outstanding previews",
      });
  }
  private async findExisting(
    type: ContentType,
    preview: InstallPreview,
    mode: "scnexus" | "ccm",
    paths: GamePaths,
  ): Promise<ExistingInstallation[]> {
    const matches: ExistingInstallation[] = [];
    for (const record of this.index(type).getSnapshot().records) {
      if (record.gameRoot !== paths.gameRoot || record.mode !== mode) continue;
      const matchedBy: ExistingInstallation["matchedBy"] = [];
      if (mode === "scnexus") {
        if (
          preview.package.scnid !== undefined &&
          record.package.scnid === preview.package.scnid
        )
          matchedBy.push("scnid");
        if (record.package.name === preview.package.name)
          matchedBy.push("name");
      } else if (record.package.name === preview.package.name)
        matchedBy.push("title");
      if (matchedBy.length && (await existing(record.managementDirectory)))
        matches.push({
          localId: record.localId,
          package: record.package,
          directory: record.managementDirectory,
          descriptorPath: record.descriptorPath,
          matchedBy,
          record,
        });
    }
    if (mode === "ccm") {
      const directory = await safePath(
        paths.gameRoot,
        relative(
          paths.gameRoot,
          join(paths.ccmRoot, ccmDirectoryName(preview.package.name)),
        ),
      );
      const info = await existing(directory);
      if (info) {
        const descriptorPath = join(directory, "metadata.txt");
        let pkg: Package | null = null;
        let diagnostic: ExistingInstallation["diagnostic"];
        try {
          pkg = parseCcm(decodeCcm(await readFile(descriptorPath)).text);
        } catch (error) {
          if (
            !(error instanceof AppError) &&
            (error as NodeJS.ErrnoException).code !== "ENOENT" &&
            (error as NodeJS.ErrnoException).code !== "ENOTDIR" &&
            !(error instanceof TypeError)
          )
            throw error;
          diagnostic = {
            code: ERRORS.ARCHIVE_METADATA_INVALID.code,
            message: "已存在同名内容，但信息无法解析",
          };
        }
        const found = matches.find(
          (record) => keyPath(record.directory) === keyPath(directory),
        );
        if (found) {
          found.matchedBy.push("directory");
          found.package = pkg;
          if (diagnostic) found.diagnostic = diagnostic;
        } else {
          matches.push({
            localId: null,
            package: pkg,
            ...(diagnostic ? { diagnostic } : {}),
            directory,
            descriptorPath,
            matchedBy:
              pkg?.name === preview.package.name
                ? ["title", "directory"]
                : ["directory"],
            record: null,
          });
        }
      }
    }
    return matches;
  }
  private async conflicts(
    files: PlannedFile[],
    paths: GamePaths,
  ): Promise<Conflict[]> {
    const result: Conflict[] = [];
    for (const file of files) {
      const target = await safePath(paths.gameRoot, file.target);
      const info = await existing(target);
      if (info) {
        if (!info.isFile()) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED);
        result.push({
          conflictId: randomUUID(),
          type: file.type,
          incoming: {
            name: basename(file.source),
            path: file.source,
            bytes: file.bytes,
            modifiedAt: file.modifiedAt,
          },
          local: {
            name: basename(target),
            path: target,
            bytes: info.size,
            modifiedAt: info.mtimeMs,
          },
        });
      }
    }
    return result;
  }
  async analyze(
    type: ContentType,
    input: SourceInput,
  ): Promise<AnalysisResult> {
    if (!["campaign", "customize"].includes(type))
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    this.prune();
    const paths = await this.paths();
    const source = await openSource(input);
    const result: AnalysisResult = {
      analysisId: randomUUID(),
      contentType: type,
      source: input,
      sourceTree: source.tree,
      sourceStats: {
        ...(input.kind === "archive"
          ? { compressedBytes: (await lstat(input.path)).size }
          : {}),
        fileCount: source.entries.length,
        bytes: source.entries.reduce((n, e) => n + e.bytes, 0),
      },
      modes: { scnexus: null, ccm: null, auto: null },
      recommendedMode: null,
      existingInstallations: { scnexus: [], ccm: [], auto: [] },
      conflicts: [],
      diagnostics: [],
    };
    const discover = async (name: string, ccm: boolean) => {
      const found: InstallPreview[] = [];
      for (const entry of source.entries
        .filter((e) => e.path.split("/").at(-1)?.toLowerCase() === name)
        .filter(
          (e) =>
            !e.path
              .split("/")
              .slice(0, -1)
              .some((p) => /\.sc2(map|mod)$/i.test(p)),
        )) {
        try {
          if (entry.bytes > 1024 * 1024)
            throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID);
          const data = await source.read(entry.path);
          const pkg = ccm
            ? parseCcm(decodeCcm(data).text)
            : parsePackage(data.toString("utf8"), type);
          found.push(buildPreview(source, entry.path, pkg, ccm));
        } catch (error) {
          result.diagnostics.push({
            mode: ccm ? "ccm" : "scnexus",
            level: "error",
            code:
              error instanceof AppError
                ? error.code
                : ERRORS.ARCHIVE_METADATA_INVALID.code,
            message: `Invalid descriptor: ${entry.path}`,
          });
        }
      }
      if (!found.length) return null;
      const depth = Math.min(
        ...found.map((p) => p.descriptorPath.split("/").length),
      );
      const outer = found.filter(
        (p) => p.descriptorPath.split("/").length === depth,
      );
      if (outer.length > 1) {
        result.diagnostics.push({
          mode: ccm ? "ccm" : "scnexus",
          level: "error",
          code: ERRORS.ARCHIVE_METADATA_INVALID.code,
          message:
            "Multiple outermost packages: " +
            outer.map((p) => p.descriptorPath).join(", "),
        });
        return null;
      }
      return outer[0];
    };
    result.modes.scnexus = await discover("package.json", false);
    if (type === "campaign")
      result.modes.ccm = await discover("metadata.txt", true);
    if (!result.modes.scnexus && result.modes.ccm) {
      result.modes.scnexus = {
        ...structuredClone(result.modes.ccm),
        origin: "ccm-converted",
      };
    }
    for (const name of ["scnexus", "ccm"] as const) {
      const preview = result.modes[name];
      if (preview?.package.dependencies?.length)
        result.diagnostics.push({
          mode: name,
          level: "warning",
          code: "DEPENDENCIES_REQUIRE_MANUAL_CHECK",
          message:
            "Declared dependencies are not downloaded automatically; confirm they are installed",
        });
    }
    const recommended =
      result.modes.scnexus?.origin === "package-json"
        ? result.modes.scnexus.package.manager
        : undefined;
    const mode =
      recommended === "SCNexus"
        ? "scnexus"
        : recommended === "CCM"
          ? "ccm"
          : null;
    if (mode && result.modes[mode]) result.recommendedMode = mode;
    const hashes = new Map<string, string>();
    for (const mode of ["scnexus", "ccm"] as const) {
      const preview = result.modes[mode];
      if (!preview) continue;
      result.existingInstallations[mode] = await this.findExisting(
        type,
        preview,
        mode,
        paths,
      );
      result.conflicts.push({
        mode,
        files: await this.conflicts(
          mode === "ccm"
            ? preview.files.filter((f) => f.type === "mod")
            : preview.files,
          paths,
        ),
      });
      for (const file of preview.files)
        if (!hashes.has(file.source))
          hashes.set(file.source, hash(await source.read(file.source)));
      hashes.set(
        preview.descriptorPath,
        hash(await source.read(preview.descriptorPath)),
      );
    }
    for (const group of result.conflicts)
      for (const file of group.files)
        hashes.set(
          "local:" + file.local.path,
          hash(await readFile(file.local.path)),
        );
    this.analyses.set(result.analysisId, {
      source,
      result,
      root: paths.gameRoot,
      gameRevision: paths._revision,
      hashes,
      expires: Date.now() + 30 * 60 * 1000,
    });
    return structuredClone(result);
  }
  private decisions(
    conflicts: Conflict[],
    decisions: ConflictDecision[],
    files: PlannedFile[],
  ) {
    if (!Array.isArray(decisions))
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    const choices = new Map<string, "overwrite" | "keep">();
    const seen = new Set<string>();
    for (const decision of decisions) {
      const c = conflicts.find((c) => c.conflictId === decision?.conflictId);
      if (
        !c ||
        seen.has(c.conflictId) ||
        !["keep", "overwrite"].includes(decision.action)
      )
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
      seen.add(c.conflictId);
      choices.set(keyPath(c.local.path), decision.action);
    }
    for (const c of conflicts)
      if (!seen.has(c.conflictId))
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Unresolved file conflicts",
        });
    return choices;
  }
  private async recheckConflicts(
    files: PlannedFile[],
    conflicts: Conflict[],
    paths: GamePaths,
    hashes: Map<string, string>,
  ) {
    for (const f of files) {
      const target = await safePath(paths.gameRoot, f.target);
      const actual = await existing(target);
      const old = conflicts.find(
        (c) => keyPath(c.local.path) === keyPath(target),
      );
      if (
        !!actual !== !!old ||
        (actual &&
          old &&
          (actual.size !== old.local.bytes ||
            actual.mtimeMs !== old.local.modifiedAt))
      )
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Target changed; request a new preview",
        });
      if (
        actual &&
        old &&
        hash(await readFile(target)) !== hashes.get("local:" + old.local.path)
      )
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Target contents changed",
        });
    }
  }
  private async transaction<T>(
    paths: GamePaths,
    run: (
      write: (path: string, data: Buffer | null) => Promise<void>,
    ) => Promise<T>,
    removeDirectories: string[] = [],
    operationId?: string,
  ): Promise<T> {
    return fileTransaction(
      paths.gameRoot,
      async (write) => {
        this.checkCancelled(operationId ?? this.operationId);
        return run(async (path, data) => {
          this.checkCancelled(operationId ?? this.operationId);
          await write(path, data);
        });
      },
      removeDirectories,
    );
  }

  private async copy(
    files: PlannedFile[],
    read: (source: string) => Promise<Buffer>,
    paths: GamePaths,
    choices: Map<string, string>,
    write: (path: string, data: Buffer | null) => Promise<void>,
  ) {
    const installed: InstalledFile[] = [];
    for (const f of files) {
      const target = await safePath(paths.gameRoot, f.target);
      const local = await existing(target);
      const keep = choices.get(keyPath(target)) === "keep";
      const data = keep ? await readFile(target) : await read(f.source);
      if (!keep) await write(target, data);
      installed.push({
        ...f,
        bytes: data.length,
        absolutePath: target,
        result: keep ? "kept" : local ? "replaced" : "copied",
        hash: hash(data),
      });
    }
    return installed;
  }
  async install(
    selection: {
      analysisId: string;
      mode: string;
      decisions: ConflictDecision[];
    },
    expectedType?: ContentType,
  ): Promise<ContentRecord> {
    if (
      !selection ||
      typeof selection.analysisId !== "string" ||
      typeof selection.mode !== "string"
    )
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    return this.operation(selection.analysisId, async () => {
      this.prune();
      const context = this.analyses.get(selection?.analysisId);
      const mode = selection?.mode;
      if (!context || !["scnexus", "ccm"].includes(mode))
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
      const preview = context.result.modes[mode as "scnexus" | "ccm"];
      if (!preview) throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED);
      const paths = await this.paths();
      if (
        context.root !== paths.gameRoot ||
        context.gameRevision !== paths._revision
      )
        throw new AppError(ERRORS.TASK_CONFLICT);
      const source = await openSource(context.source.input);
      if (
        JSON.stringify(source.entries) !==
        JSON.stringify(context.source.entries)
      )
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Source layout changed",
        });
      for (const [path, digest] of context.hashes)
        if (
          !path.startsWith("local:") &&
          hash(await source.read(path)) !== digest
        )
          throw new AppError(ERRORS.TASK_CONFLICT, {
            message: "Source changed",
          });
      const type = context.result.contentType;
      if (expectedType && type !== expectedType)
        throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED);
      if (
        (
          await this.findExisting(
            type,
            preview,
            mode as "scnexus" | "ccm",
            paths,
          )
        ).length
      )
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message:
            "Matching content is already installed; request a new analysis",
        });
      const direct = type === "customize" || mode === "ccm";
      const actualFiles =
        mode === "ccm"
          ? preview.files.filter((f) => f.type === "mod")
          : preview.files;
      const conflicts = context.result.conflicts
        .find((c) => c.mode === mode)!
        .files.filter((c) => mode !== "ccm" || c.type === "mod");
      const choices = direct
        ? this.decisions(conflicts, selection.decisions ?? [], actualFiles)
        : new Map<string, string>();
      if (direct)
        await this.recheckConflicts(
          actualFiles,
          conflicts,
          paths,
          context.hashes,
        );
      const localId = randomUUID();
      const management =
        mode === "ccm"
          ? join(paths.ccmRoot, ccmDirectoryName(preview.package.name))
          : join(paths.customizeDataRoot, localId);
      const payload =
        type === "campaign"
          ? mode === "ccm"
            ? management
            : join(management, "payload")
          : null;
      await safePath(paths.gameRoot, relative(paths.gameRoot, management));
      await mkdir(dirname(management), { recursive: true });
      try {
        await mkdir(management);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "EEXIST")
          throw new AppError(
            ERRORS.TASK_CONFLICT,
            { message: "CCM package directory already exists" },
            { cause },
          );
        throw cause;
      }
      const originalCcmPath =
        preview.origin !== "package-json"
          ? preview.descriptorPath
          : source.entries.find(
              (e) =>
                e.path ===
                (preview.rootRelativePath
                  ? preview.rootRelativePath + "/"
                  : "") +
                  "metadata.txt",
            )?.path;
      const ccm = originalCcmPath
        ? decodeCcm(await source.read(originalCcmPath))
        : null;
      const pkg = structuredClone(preview.package);
      if (preview.origin === "ccm-converted") {
        pkg.maps = preview.files
          .filter((f) => f.type === "map" && !f.official)
          .map((f) => ({
            name: basename(f.target),
            source_path: "/" + f.target,
            target_path: "/" + f.target,
          }));
        pkg.mods = [
          ...new Set(
            preview.files
              .filter((f) => f.type === "mod")
              .map((f) => f.target.match(/^(.*?\.sc2mod)(?:\/|$)/i)![1]),
          ),
        ].map((target) => ({
          name: basename(target),
          source_path: "/" + target,
          target_path: "/" + target,
          components: preview.files.some((f) =>
            f.target.startsWith(target + "/"),
          ),
        }));
      }
      const files = preview.files.map((f) => ({
        ...f,
        source:
          type === "campaign"
            ? mode === "scnexus" && preview.origin === "ccm-converted"
              ? f.target
              : f.source.slice(
                  preview.rootRelativePath
                    ? preview.rootRelativePath.length + 1
                    : 0,
                )
            : f.source,
      }));
      const record: ContentRecord = {
        localId,
        package: pkg,
        mode: mode as "scnexus" | "ccm",
        origin: preview.origin,
        source: source.input,
        rootRelativePath: preview.rootRelativePath,
        managementDirectory: management,
        descriptorPath: join(
          management,
          mode === "ccm" ? "metadata.txt" : "package.json",
        ),
        payloadDirectory: payload,
        ccmOriginal: ccm,
        files,
        installedFiles: [],
        sourceTree: source.tree,
        targetTree: preview.targetTree,
        fileCount: preview.fileCount,
        bytes: preview.bytes,
        importedAt: Date.now(),
        gameRoot: paths.gameRoot,
      };
      try {
        return await this.transaction(paths, async (write) => {
          if (payload) {
            await mkdir(payload, { recursive: true });
            for (const f of preview.files) {
              const destination = await safePath(
                payload,
                mode === "scnexus" && preview.origin === "ccm-converted"
                  ? f.target
                  : f.source.slice(
                      preview.rootRelativePath
                        ? preview.rootRelativePath.length + 1
                        : 0,
                    ),
              );
              await write(destination, await source.read(f.source));
            }
          }
          if (direct)
            record.installedFiles = await this.copy(
              actualFiles,
              source.read,
              paths,
              choices,
              write,
            );
          if (type === "customize") {
            record.targetTree = makeTree(
              record.installedFiles.map((f) => ({
                path: f.target,
                bytes: f.bytes,
                modifiedAt: f.modifiedAt,
              })),
              "GameRoot",
            );
            record.fileCount = record.installedFiles.length;
            record.bytes = record.installedFiles.reduce(
              (n, f) => n + f.bytes,
              0,
            );
          }
          await write(
            record.descriptorPath,
            mode === "ccm"
              ? await source.read(preview.descriptorPath)
              : Buffer.from(JSON.stringify(pkg, null, 2)),
          );
          if (mode === "scnexus" && ccm)
            await write(
              join(management, "metadata.txt"),
              await source.read(originalCcmPath!),
            );
          if (mode === "scnexus")
            await write(
              join(management, "install-manifest.json"),
              Buffer.from(JSON.stringify(record, null, 2)),
            );
          const index = this.index(type);
          const old = index.getSnapshot();
          index.update({ ...old, records: [...old.records, record] });
          this.analyses.delete(selection.analysisId);
          return record;
        });
      } catch (error) {
        await rm(management, { recursive: true, force: true });
        throw error;
      }
    });
  }
  private find(localId: string): ContentRecord {
    for (const index of [this.campaign, this.customize]) {
      const record = index
        .getSnapshot()
        .records.find((r) => r.localId === localId);
      if (record) return structuredClone(record);
    }
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT, {
      message: "Unknown local content ID",
    });
  }
  async prepareActivation(localId: string): Promise<ActivationPreview> {
    this.prune();
    const record = this.find(localId);
    if (record.package.type !== "campaign" || !record.payloadDirectory)
      throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED);
    const paths = await this.paths();
    validateRecordPaths(record, paths);
    await safePath(
      paths.gameRoot,
      relative(paths.gameRoot, record.managementDirectory),
    );
    const files =
      record.mode === "ccm"
        ? record.files.filter((f) => f.type === "map")
        : record.files;
    const preview: ActivationPreview = {
      activationId: randomUUID(),
      localId,
      files,
      conflicts: await this.conflicts(files, paths),
    };
    const hashes = new Map<string, string>();
    for (const f of files)
      hashes.set(
        f.source,
        hash(await readFile(await safePath(record.payloadDirectory, f.source))),
      );
    for (const file of preview.conflicts)
      hashes.set(
        "local:" + file.local.path,
        hash(await readFile(file.local.path)),
      );
    hashes.set("descriptor", hash(await readFile(record.descriptorPath)));
    this.activations.set(preview.activationId, {
      record,
      preview,
      gameRevision: paths._revision,
      hashes,
      expires: Date.now() + 30 * 60 * 1000,
    });
    return structuredClone(preview);
  }
  async activate(activationId: string, decisions: ConflictDecision[] = []) {
    return this.operation(activationId, async () => {
      this.prune();
      const context = this.activations.get(activationId);
      if (!context) throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
      const { record, preview } = context;
      const paths = await this.paths();
      if (context.gameRevision !== paths._revision)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Game configuration changed",
        });
      validateRecordPaths(record, paths);
      await safePath(
        paths.gameRoot,
        relative(paths.gameRoot, record.managementDirectory),
      );
      const state = this.active.getSnapshot();
      const previous = state.active[record.package.campaign!];
      if (previous && previous.localId !== record.localId)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Deactivate current campaign first",
        });
      const choices = this.decisions(
        preview.conflicts,
        decisions,
        preview.files,
      );
      await this.recheckConflicts(
        preview.files,
        preview.conflicts,
        paths,
        context.hashes,
      );
      if (
        hash(await readFile(record.descriptorPath)) !==
        context.hashes.get("descriptor")
      )
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Descriptor changed",
        });
      const read = async (path: string) => {
        const data = await readFile(
          await safePath(record.payloadDirectory!, path),
        );
        if (hash(data) !== context.hashes.get(path))
          throw new AppError(ERRORS.TASK_CONFLICT, {
            message: "Payload changed",
          });
        return data;
      };
      return this.transaction(paths, async (write) => {
        const installedFiles = await this.copy(
          preview.files,
          read,
          paths,
          choices,
          write,
        );
        const root = campaignRoots[record.package.campaign!][0];
        const descriptor = await safePath(
          paths.gameRoot,
          root +
            "/" +
            (record.mode === "ccm" ? "metadata.txt" : "package.json"),
        );
        await write(descriptor, await readFile(record.descriptorPath));
        await write(
          await safePath(
            paths.gameRoot,
            root +
              "/" +
              (record.mode === "ccm" ? "package.json" : "metadata.txt"),
          ),
          null,
        );
        const active = {
          localId: record.localId,
          campaign: record.package.campaign!,
          mode: record.mode,
          descriptorPath: descriptor,
          installedFiles:
            record.mode === "ccm"
              ? [
                  ...installedFiles,
                  ...record.installedFiles.filter((f) => f.type === "mod"),
                ]
              : installedFiles,
          activatedAt: Date.now(),
          gameRoot: paths.gameRoot,
        };
        if (record.mode === "scnexus")
          await write(
            join(record.managementDirectory, "active-manifest.json"),
            Buffer.from(JSON.stringify(active, null, 2)),
          );
        this.active.update({
          ...state,
          active: { ...state.active, [active.campaign]: active },
        });
        this.activations.delete(activationId);
        return active;
      });
    });
  }
  private stamp() {
    return JSON.stringify([
      this.campaign.getSnapshot()._revision,
      this.customize.getSnapshot()._revision,
      this.active.getSnapshot()._revision,
    ]);
  }
  async prepareRemoval(
    localId: string,
    operation: "uninstall" | "deactivate",
    expectedType?: ContentType,
  ): Promise<RemovalPreview> {
    this.prune();
    const record = this.find(localId);
    if (expectedType && record.package.type !== expectedType)
      throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED);
    const paths = await this.paths();
    validateRecordPaths(record, paths);
    await safePath(
      paths.gameRoot,
      relative(paths.gameRoot, record.managementDirectory),
    );
    const active = this.active.getSnapshot().active[record.package.campaign!];
    if (operation === "uninstall" && active?.localId === localId)
      throw new AppError(ERRORS.TASK_CONFLICT, {
        message: "Deactivate before removing campaign library",
      });
    if (operation === "deactivate" && active?.localId !== localId)
      throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
    const files =
      operation === "deactivate"
        ? active!.installedFiles
        : record.installedFiles;
    const others = [
      ...this.customize
        .getSnapshot()
        .records.filter((r) => r.gameRoot === paths.gameRoot)
        .map((r) => ({
          localId: r.localId,
          name: r.package.name,
          type: "customize" as const,
          files: r.installedFiles,
        })),
      ...Object.values(this.active.getSnapshot().active)
        .filter((a) => a.gameRoot === paths.gameRoot)
        .map((a) => ({
          localId: a.localId,
          name:
            this.campaign
              .getSnapshot()
              .records.find((r) => r.localId === a.localId)?.package.name ??
            a.localId,
          type: "campaign" as const,
          files: a.installedFiles,
        })),
    ].filter((r) => r.localId !== localId);
    const preview: RemovalPreview = {
      removalId: randomUUID(),
      localId,
      operation,
      files: [],
    };
    if (record.mode === "scnexus")
      for (const file of files.filter((f) => !f.official)) {
        const usedBy = others
          .filter((o) =>
            o.files.some((f) => keyPath(f.target) === keyPath(file.target)),
          )
          .map(({ files, ...o }) => o);
        if (usedBy.length)
          preview.files.push({ conflictId: randomUUID(), file, usedBy });
      }
    this.removals.set(preview.removalId, {
      preview,
      record,
      active: operation === "deactivate",
      gameRevision: paths._revision,
      stamp: this.stamp(),
      expires: Date.now() + 30 * 60 * 1000,
    });
    return structuredClone(preview);
  }
  async remove(
    removalId: string,
    decisions: RemovalDecision[] = [],
    expectedType?: ContentType,
  ) {
    return this.operation(removalId, async () => {
      this.prune();
      const context = this.removals.get(removalId);
      if (!context || context.stamp !== this.stamp())
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Removal preview expired",
        });
      const { record, preview } = context;
      if (expectedType && record.package.type !== expectedType)
        throw new AppError(ERRORS.CONTENT_TYPE_UNSUPPORTED);
      const paths = await this.paths();
      if (context.gameRevision !== paths._revision)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Game configuration changed",
        });
      validateRecordPaths(record, paths);
      await safePath(
        paths.gameRoot,
        relative(paths.gameRoot, record.managementDirectory),
      );
      const choices = new Map<string, string>();
      if (!Array.isArray(decisions))
        throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
      for (const d of decisions) {
        const file = preview.files.find((f) => f.conflictId === d.conflictId);
        if (
          !file ||
          choices.has(file.file.target) ||
          !["keep", "delete"].includes(d.action)
        )
          throw new AppError(ERRORS.IPC_INVALID_ARGUMENT);
        choices.set(file.file.target, d.action);
      }
      if (choices.size !== preview.files.length)
        throw new AppError(ERRORS.TASK_CONFLICT, {
          message: "Unresolved shared file decisions",
        });
      const state = this.active.getSnapshot();
      const active = state.active[record.package.campaign!];
      const files = context.active
        ? active!.installedFiles
        : record.installedFiles;
      const removable =
        record.mode === "ccm" ? files.filter((f) => f.type === "map") : files;
      await this.transaction(
        paths,
        async (write) => {
          for (const f of removable) {
            if (choices.get(f.target) === "keep") continue;
            await write(await safePath(paths.gameRoot, f.target), null);
          }
          const directories = new Set<string>();
          for (const file of removable) {
            const match = file.target.match(/^(.*?\.sc2(?:map|mod))\//i);
            if (!match) continue;
            let path = dirname(file.target).replaceAll("\\", "/");
            while (path.length >= match[1].length) {
              directories.add(path);
              if (path === match[1]) break;
              path = dirname(path).replaceAll("\\", "/");
            }
          }
          for (const logical of [...directories].sort(
            (a, b) => b.length - a.length,
          )) {
            try {
              await rmdir(await safePath(paths.gameRoot, logical));
            } catch (error) {
              if (
                !["ENOENT", "ENOTEMPTY", "EEXIST"].includes(
                  (error as NodeJS.ErrnoException).code ?? "",
                )
              )
                throw error;
            }
          }
          if (context.active) {
            await write(
              await safePath(
                paths.gameRoot,
                campaignRoots[record.package.campaign!][0] +
                  "/" +
                  (record.mode === "ccm" ? "metadata.txt" : "package.json"),
              ),
              null,
            );
            if (record.mode === "scnexus")
              await write(
                join(record.managementDirectory, "active-manifest.json"),
                null,
              );
            const next = { ...state.active };
            delete next[record.package.campaign!];
            this.active.update({ ...state, active: next });
          } else {
            if (record.external) await write(record.descriptorPath, null);
            const index = this.index(record.package.type as ContentType);
            const old = index.getSnapshot();
            index.update({
              ...old,
              records: old.records.filter((r) => r.localId !== record.localId),
            });
          }
        },
        context.active || record.external ? [] : [record.managementDirectory],
      );
      this.removals.delete(removalId);
      return { localId: record.localId, operation: preview.operation };
    });
  }
  async scan() {
    return this.lock(async () => {
      const paths = await this.paths();
      const { scanContent } = await import("./scanner");
      const result = await scanContent(
        paths,
        this.campaign.getSnapshot().records,
      );
      const previous = [
        this.campaign.getSnapshot(),
        this.customize.getSnapshot(),
      ];
      const oldActive = this.active.getSnapshot();
      const stamp = Date.now();
      try {
        for (const [i, type] of (
          ["campaign", "customize"] as const
        ).entries()) {
          const old = previous[i];
          const outside = old.records.filter(
            (r) => r.gameRoot !== paths.gameRoot,
          );
          const retained = old.records.filter(
            (r) =>
              r.gameRoot === paths.gameRoot &&
              result.diagnostics.some((d) => d.path === r.managementDirectory),
          );
          this.index(type).update({
            ...old,
            records: [
              ...outside,
              ...retained,
              ...result.records.filter((r) => r.package.type === type),
            ],
            scannedAt: stamp,
          });
        }
        const active = { ...result.active };
        for (const c of CAMPAIGNS) {
          const prior = oldActive.active[c];
          if (
            prior &&
            result.diagnostics.some(
              (d) => d.path === dirname(prior.descriptorPath),
            )
          )
            active[c] = prior;
        }
        this.active.update({ ...oldActive, active, scannedAt: stamp });
      } catch (cause) {
        this.campaign.update(previous[0]);
        this.customize.update(previous[1]);
        this.active.update(oldActive);
        throw cause;
      }
      return { ...result, scannedAt: stamp };
    });
  }
  list(type: ContentType) {
    return this.index(type).getSnapshot();
  }
  getActive() {
    return this.active.getSnapshot();
  }
}
export const contentService = new ContentService(
  getGamePaths,
  campaignRepository,
  customizeRepository,
  campaignActiveRepository,
);
