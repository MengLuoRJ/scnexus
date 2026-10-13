import { lstat, readdir, readFile, mkdir } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import type { FileTree, SourceInput } from '@scnexus/app-shared/types/content.type'
import {
  AppError,
  ERRORS,
  normalizeError,
  type ErrorDefinition,
} from '@scnexus/app-shared/errors/app.error'
import { sevenZip, SevenZipError, SevenZipTimeoutError } from '../../utils/7zip-wrapper'
import { logicalPath, keyPath, safePath } from './paths'
import { reportOperationWarning } from '../../utils/operation-warnings'
import type { SevenZipResult } from '../../utils/7zip-wrapper/types'

async function archiveOperation<T>(
  definition: ErrorDefinition,
  message: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run()
  } catch (cause) {
    if (cause instanceof SevenZipTimeoutError) throw normalizeError(cause)
    if (cause instanceof SevenZipError)
      throw new AppError(definition, { message: `${message}: ${cause.message}` }, { cause })
    throw cause
  }
}
export type Entry = { path: string; bytes: number; modifiedAt: number | null; changedAt?: number }
export type ContentSource = {
  input: SourceInput
  entries: Entry[]
  tree: FileTree
  archiveHash?: string
  descriptorPaths?: string[]
  directories?: string[]
  read(path: string): Promise<Buffer>
}
export async function hashFile(path: string): Promise<string> {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  return digest.digest('hex')
}
export async function verifyArchive(source: ContentSource) {
  const info = await lstat(source.input.path)
  if (info.isSymbolicLink() || !info.isFile()) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  if ((await hashFile(source.input.path)) !== source.archiveHash)
    throw new AppError(ERRORS.TASK_CONFLICT, { message: 'Archive source changed' })
}
export async function stageArchive(
  source: ContentSource,
  selected: string[],
  output: string,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
): Promise<Map<string, string>> {
  await verifyArchive(source)
  await mkdir(output)
  const paths = [...new Set(selected)]
  const warnings: SevenZipResult[] = []
  if (paths.length) {
    const result = await archiveOperation(
      ERRORS.ARCHIVE_EXTRACT_FAILED,
      'Archive extraction failed',
      () =>
        sevenZip.extractExact(source.input.path, paths, output, {
          signal,
          timeout: 1200000,
          onProgress: ({ percent }) => onProgress(percent),
          onWarning: (result) => warnings.push(result),
        }),
    )
    if (result.exitCode === 1 && !warnings.length) warnings.push(result)
  }
  await verifyArchive(source)
  const staged = await openSource({ kind: 'directory', path: output })
  const sourceEntries = new Map(source.entries.map((entry) => [entry.path, entry]))
  const expected = new Map(paths.map((path) => [keyPath(path), sourceEntries.get(path)]))
  const allowedDirectories = new Set(
    paths.flatMap((path) =>
      path
        .split('/')
        .slice(0, -1)
        .map((_, index) =>
          keyPath(
            path
              .split('/')
              .slice(0, index + 1)
              .join('/'),
          ),
        ),
    ),
  )
  const checkDirectories = async (directory: string, prefix = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name
      if (entry.isDirectory()) {
        if (!allowedDirectories.has(keyPath(path)))
          throw new AppError(ERRORS.ARCHIVE_INVALID, { message: 'Unexpected extraction directory' })
        await checkDirectories(await safePath(output, path), path + '/')
      }
    }
  }
  await checkDirectories(output)
  if (
    staged.entries.length !== expected.size ||
    staged.entries.some(
      (entry) =>
        !expected.has(keyPath(entry.path)) ||
        expected.get(keyPath(entry.path))?.bytes !== entry.bytes,
    )
  )
    throw new AppError(ERRORS.ARCHIVE_INVALID, { message: 'Unexpected extraction output' })
  const files = new Map(
    await Promise.all(paths.map(async (path) => [path, await safePath(output, path)] as const)),
  )
  for (const warning of warnings)
    reportOperationWarning(
      new AppError(
        ERRORS.ARCHIVE_WARNING,
        {
          message: '7-Zip extraction completed with warnings; output verified',
        },
        { cause: warning },
      ),
    )
  return files
}
export function makeTree(entries: Entry[], name: string): FileTree {
  const root: FileTree = {
    name,
    path: '',
    modifiedAt: null,
    bytes: 0,
    kind: 'directory',
    children: [],
  }
  const nodes = new Map<string, FileTree>()
  for (const entry of entries) {
    let parent = root
    root.bytes += entry.bytes
    const parts = entry.path.split('/')
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('/')
      let child = nodes.get(path)
      if (!child) {
        child = {
          name: parts[i],
          path,
          bytes: 0,
          modifiedAt: null,
          kind: i === parts.length - 1 ? 'file' : 'directory',
          ...(i === parts.length - 1 ? {} : { children: [] }),
        }
        nodes.set(path, child)
        parent.children!.push(child)
      }
      child.bytes += entry.bytes
      if (child.kind === 'file') child.modifiedAt = entry.modifiedAt
      parent = child
    }
  }
  return root
}
export async function openSource(input: SourceInput): Promise<ContentSource> {
  if (!input || !['archive', 'directory'].includes(input.kind) || typeof input.path !== 'string')
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  const info = await lstat(input.path)
  if (info.isSymbolicLink() || (input.kind === 'directory' ? !info.isDirectory() : !info.isFile()))
    throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
  const entries: Entry[] = []
  const directories: string[] = []
  const descriptorPaths: string[] = []
  const noteDescriptor = (path: string) => {
    const parts = path.split('/')
    for (let i = 0; i < parts.length; i++)
      if (/^(package\.json|metadata\.txt)$/i.test(parts[i]))
        descriptorPaths.push(parts.slice(0, i + 1).join('/'))
  }
  let archiveHash: string | undefined
  let read: ContentSource['read']
  if (input.kind === 'directory') {
    const walk = async (dir: string, prefix = '') => {
      for (const item of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + item.name
        noteDescriptor(path)
        const absolute = await safePath(input.path, path)
        const stat = await lstat(absolute)
        if (stat.isDirectory()) {
          directories.push(path)
          await walk(absolute, path + '/')
        } else if (stat.isFile())
          entries.push({
            path,
            bytes: stat.size,
            modifiedAt: stat.mtimeMs,
            changedAt: stat.ctimeMs,
          })
        else throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
      }
    }
    await walk(input.path)
    read = async (path) => readFile(await safePath(input.path, path))
  } else {
    archiveHash = await hashFile(input.path)
    const result = await archiveOperation(ERRORS.ARCHIVE_INVALID, 'Archive listing failed', () =>
      sevenZip.list(input.path),
    )
    for (const entry of result.entries) {
      if (/^[\\/]/.test(entry.path)) throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
      const path = logicalPath(entry.path)
      noteDescriptor(path)
      if (
        entry.attributes?.includes('L') ||
        entry.properties['Symbolic Link'] ||
        entry.properties['Hard Link'] ||
        /(?:^|\s)l[rwx-]{9}(?:\s|$)/.test(entry.attributes ?? '')
      )
        throw new AppError(ERRORS.FILESYSTEM_PATH_REJECTED)
      if (entry.isDirectory) directories.push(path)
      else
        entries.push({
          path,
          bytes: entry.size ?? 0,
          modifiedAt: entry.modified?.getTime() ?? null,
        })
    }
    read = (path) => {
      if (!/^(package\.json|metadata\.txt)$/i.test(path.split('/').at(-1) ?? ''))
        throw new AppError(ERRORS.ARCHIVE_METADATA_INVALID)
      return archiveOperation(ERRORS.ARCHIVE_EXTRACT_FAILED, 'Archive metadata read failed', () =>
        sevenZip.readFile(input.path, path, { maxBytes: 1024 * 1024, timeout: 120000 }),
      ).then((data) => {
        if (data.length !== entries.find((entry) => entry.path === path)?.bytes)
          throw new AppError(ERRORS.ARCHIVE_EXTRACT_FAILED, {
            message: 'Archive metadata output is incomplete',
          })
        return data
      })
    }
  }
  const seen = new Set<string>()
  const fileKeys = new Set(entries.map((entry) => keyPath(entry.path)))
  for (const entry of entries) {
    const parts = keyPath(entry.path).split('/')
    if (
      seen.has(keyPath(entry.path)) ||
      parts.slice(0, -1).some((_, index) => fileKeys.has(parts.slice(0, index + 1).join('/')))
    )
      throw new AppError(ERRORS.ARCHIVE_INVALID, {
        message: 'Duplicate archive path',
      })
    seen.add(keyPath(entry.path))
  }
  entries.sort((a, b) => a.path.localeCompare(b.path))
  return {
    input,
    entries,
    read,
    archiveHash,
    descriptorPaths: [...new Set(descriptorPaths)].sort(),
    directories: [...new Set(directories)].sort(),
    tree: makeTree(entries, basename(input.path)),
  }
}
