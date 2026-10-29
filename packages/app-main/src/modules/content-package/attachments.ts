import { createHash } from 'node:crypto'
import { lstat, open, mkdir, writeFile, readdir } from 'node:fs/promises'
import { join, posix } from 'node:path'
import { nativeImage } from 'electron'
import type {
  ContentAssets,
  ContentAsset,
  ContentRecord,
  Package,
  InstallPreview,
} from '@scnexus/app-shared/types/content.type'
import type { ContentSource } from './source'
import { safePath } from './paths'

const IMAGE_LIMIT = 8 * 1024 * 1024
const DOCUMENT_LIMIT = 1024 * 1024
const TOTAL_LIMIT = 64 * 1024 * 1024
const FILE_LIMIT = 256
export const emptyAssets = (): ContentAssets => ({
  image: null,
  readme: null,
  changelog: null,
  docs: [],
})
export function attachmentPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    !/[\\:?#]/.test(value) &&
    ![...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    !value.startsWith('/') &&
    value
      .split('/')
      .every(
        (part) =>
          part !== '' &&
          part !== '.' &&
          part !== '..' &&
          !/[. ]$/.test(part) &&
          !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
      )
  )
}
function kind(path: string) {
  const extension = posix.extname(path).toLowerCase()
  if (extension === '.md' || extension === '.txt') return 'document'
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) return 'image'
  return null
}
export const attachmentName = (path: string) => createHash('sha256').update(path).digest('hex')
function descriptorSibling(preview: InstallPreview): string {
  return preview.descriptorPath.includes('/')
    ? preview.descriptorPath.slice(0, preview.descriptorPath.lastIndexOf('/') + 1)
    : preview.rootRelativePath
      ? preview.rootRelativePath + '/'
      : ''
}
function primaryCandidates(pkg: Package, sibling: string): string[] {
  const imageKey = pkg.type === 'campaign' ? 'banner' : 'cover'
  const image =
    pkg.type === 'campaign' ? pkg.banner : pkg.type === 'customize' ? pkg.cover : undefined
  return [
    ...(pkg.type === 'dependency'
      ? []
      : image !== undefined
        ? [image]
        : [`${imageKey}.jpg`, `${imageKey}.png`, `${imageKey}.webp`].map((path) => sibling + path)),
    ...(pkg.readme !== undefined
      ? [pkg.readme]
      : ['README.txt', 'README.md', 'readme.txt', 'readme.md'].map((path) => sibling + path)),
    ...(pkg.changelog !== undefined
      ? [pkg.changelog]
      : ['CHANGELOG.txt', 'CHANGELOG.md', 'changelog.txt', 'changelog.md'].map(
          (path) => sibling + path,
        )),
    ...(pkg.docs ?? []),
  ]
}

export function matchesAsset(path: string, pattern: unknown): boolean {
  if (
    typeof pattern !== 'string' ||
    /[?{}![\]]/.test(pattern) ||
    !attachmentPath(pattern.replaceAll('*', 'x')) ||
    pattern.split('/').some((part) => part !== '**' && part.includes('**')) ||
    !attachmentPath(path)
  )
    return false
  const expression = pattern
    .split('/')
    .map((part, index, parts) => {
      if (part === '**') return index === parts.length - 1 ? '(?:[^/]+(?:/[^/]+)*)?' : '(?:[^/]+/)*'
      return (
        part
          .split('*')
          .map((literal) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^/]*') + (index === parts.length - 1 ? '' : '/')
      )
    })
    .join('')
  return new RegExp('^' + expression + '$').test(path)
}

function allowedAttachment(pkg: Package, sibling: string, path: string): boolean {
  if (
    !attachmentPath(path) ||
    !kind(path) ||
    /(?:^|\/)metadata\.txt$/i.test(path) ||
    /\.sc2(?:map|mod)\//i.test(path)
  )
    return false
  return (
    primaryCandidates(pkg, sibling).includes(path) ||
    (Array.isArray(pkg.assets) && pkg.assets.some((pattern) => matchesAsset(path, pattern)))
  )
}

export function attachmentCandidates(source: ContentSource, preview: InstallPreview): string[] {
  let entries = source.entries
  const sibling = descriptorSibling(preview)
  const pkg = preview.package
  const preferred = primaryCandidates(pkg, sibling)
  const priority = new Map(preferred.map((path, index) => [path, index]))
  entries = [...entries].sort(
    (left, right) => (priority.get(left.path) ?? Infinity) - (priority.get(right.path) ?? Infinity),
  )
  let bytes = 0
  return entries
    .filter((entry) => {
      const type =
        /(?:^|\/)metadata\.txt$/i.test(entry.path) || /\.sc2(?:map|mod)\//i.test(entry.path)
          ? null
          : kind(entry.path)
      if (
        !type ||
        !allowedAttachment(pkg, sibling, entry.path) ||
        !attachmentPath(entry.path) ||
        entry.bytes < 0 ||
        entry.bytes > (type === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT) ||
        bytes + entry.bytes > TOTAL_LIMIT
      )
        return false
      bytes += entry.bytes
      return true
    })
    .slice(0, FILE_LIMIT)
    .map((entry) => entry.path)
}
async function boundedRead(root: string, path: string, limit: number): Promise<Buffer | null> {
  try {
    if ((await lstat(root)).isSymbolicLink()) return null
    const absolute = await safePath(root, path)
    const info = await lstat(absolute)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > limit)
      return null
    const file = await open(absolute, 'r')
    try {
      const stat = await file.stat()
      if (
        !stat.isFile() ||
        stat.nlink !== 1 ||
        stat.size > limit ||
        stat.ino !== info.ino ||
        stat.dev !== info.dev
      )
        return null
      const buffer = Buffer.alloc(limit + 1)
      let length = 0
      while (length < buffer.length) {
        const { bytesRead } = await file.read(buffer, length, buffer.length - length, null)
        if (!bytesRead) break
        length += bytesRead
      }
      return length <= limit ? buffer.subarray(0, length) : null
    } finally {
      await file.close()
    }
  } catch (error) {
    if (
      ['ENOENT', 'ENOTDIR', 'FILESYSTEM-PATH-REJECTED'].includes(
        (error as NodeJS.ErrnoException).code ?? '',
      ) ||
      (error as Error).name === 'FILESYSTEM-PATH-REJECTED'
    )
      return null
    throw error
  }
}
function decode(path: string, buffer: Buffer): ContentAsset | null {
  if (kind(path) === 'document') {
    try {
      return {
        path,
        mime: path.toLowerCase().endsWith('.md') ? 'text/markdown' : 'text/plain',
        data: new TextDecoder('utf-8', { fatal: true }).decode(buffer),
      }
    } catch {
      return null
    }
  }
  let mime: string | null = null
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    mime = 'image/png'
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mime = 'image/jpeg'
  else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
    mime = 'image/webp'
  if (!mime) return null
  try {
    const image = nativeImage.createFromBuffer(buffer)
    const size = image.getSize()
    if (
      image.isEmpty() ||
      size.width <= 0 ||
      size.height <= 0 ||
      size.width * size.height > 32 * 1024 * 1024
    )
      return null
    // Return decoder-produced pixels, not untrusted trailing data from the package.
    const data = image.toPNG()
    if (data.length > IMAGE_LIMIT) return null
    return { path, mime: 'image/png', data: data.toString('base64') }
  } catch {
    return null
  }
}
export async function persistAttachments(
  source: ContentSource,
  preview: InstallPreview,
  files: Map<string, string>,
  management: string,
): Promise<NonNullable<ContentRecord['attachments']>> {
  const stored: string[] = []
  let bytes = 0
  for (const path of attachmentCandidates(source, preview)) {
    const absolute = files.get(path)
    if (!absolute) continue
    const buffer = await boundedRead(
      source.input.kind === 'directory' ? source.input.path : posixRoot(absolute, path),
      path,
      kind(path) === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT,
    )
    if (!buffer || bytes + buffer.length > TOTAL_LIMIT || !decode(path, buffer)) continue
    bytes += buffer.length
    if (!stored.length) await mkdir(join(management, '.attachments'))
    await writeFile(join(management, '.attachments', attachmentName(path)), buffer)
    stored.push(path)
  }
  return {
    index: selectIndex(preview.package, descriptorSibling(preview), new Set(stored)),
    files: stored,
  }
}
function selectIndex(pkg: Package, sibling: string, available: Set<string>): ContentAssets {
  const select = (explicit: unknown, probes: string[], type: 'image' | 'document') => {
    const candidates = explicit === undefined ? probes.map((path) => sibling + path) : [explicit]
    return (
      candidates.find(
        (path): path is string =>
          attachmentPath(path) && kind(path) === type && available.has(path),
      ) ?? null
    )
  }
  const imageKey = pkg.type === 'campaign' ? 'banner' : pkg.type === 'customize' ? 'cover' : null
  const image = imageKey
    ? select(
        pkg.type === 'campaign' ? pkg.banner : pkg.type === 'customize' ? pkg.cover : undefined,
        [`${imageKey}.jpg`, `${imageKey}.png`, `${imageKey}.webp`],
        'image',
      )
    : null
  return {
    image,
    readme: select(pkg.readme, ['README.txt', 'README.md', 'readme.txt', 'readme.md'], 'document'),
    changelog: select(
      pkg.changelog,
      ['CHANGELOG.txt', 'CHANGELOG.md', 'changelog.txt', 'changelog.md'],
      'document',
    ),
    docs: (pkg.docs ?? []).filter(
      (path) => attachmentPath(path) && kind(path) === 'document' && available.has(path),
    ),
  }
}

function posixRoot(absolute: string, path: string) {
  let root = absolute
  for (const _part of path.split('/')) root = join(root, '..')
  return root
}
export async function readAttachment(
  record: ContentRecord,
  path: string,
): Promise<ContentAsset | null> {
  const sibling = record.attachments && record.rootRelativePath ? record.rootRelativePath + '/' : ''
  if (!allowedAttachment(record.package, sibling, path)) return null
  if (!record.attachments) return readLegacyAttachment(record, path)
  if (
    !attachmentPath(path) ||
    !kind(path) ||
    !Array.isArray(record.attachments?.files) ||
    record.attachments.files.length > FILE_LIMIT ||
    !record.attachments.files.includes(path)
  )
    return null
  const buffer = await boundedRead(
    record.managementDirectory,
    '.attachments/' + attachmentName(path),
    kind(path) === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT,
  )
  return buffer ? decode(path, buffer) : null
}
export async function readAttachmentIndex(record: ContentRecord): Promise<ContentAssets> {
  if (!record.attachments) return readLegacyIndex(record)
  const result = emptyAssets()
  const index = record.attachments?.index
  if (!index || typeof index !== 'object') return result
  for (const key of ['image', 'readme', 'changelog'] as const) {
    const path = index[key]
    if (attachmentPath(path)) {
      const asset = await readAttachment(record, path)
      if (
        asset &&
        (key === 'image' ? asset.mime.startsWith('image/') : asset.mime.startsWith('text/'))
      )
        result[key] = path
    }
  }
  if (Array.isArray(index.docs))
    for (const path of index.docs.slice(0, FILE_LIMIT)) {
      if (attachmentPath(path) && (await readAttachment(record, path))?.mime.startsWith('text/'))
        result.docs.push(path)
    }
  return result
}

// Only installed, validated roots are inspected; never reopen record.source.
async function legacyFiles(record: ContentRecord) {
  const files = new Map<string, string>()
  const root = record.managementDirectory
  let bytes = 0
  let visited = 0
  const walk = async (prefix = '', depth = 0): Promise<void> => {
    if (depth > 8 || visited >= 2048 || files.size >= FILE_LIMIT) return
    const directory = prefix ? await safePath(root, prefix) : root
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink()) return
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++visited > 2048 || files.size >= FILE_LIMIT) break
      const path = prefix ? prefix + '/' + entry.name : entry.name
      if (
        !attachmentPath(path) ||
        entry.isSymbolicLink() ||
        entry.name.startsWith('.') ||
        /\.sc2(?:map|mod)$/i.test(entry.name)
      )
        continue
      if (entry.isDirectory()) {
        await walk(path, depth + 1)
        continue
      }
      const type = kind(path)
      if (
        !entry.isFile() ||
        !type ||
        /(?:^|\/)metadata\.txt$/i.test(path) ||
        !allowedAttachment(record.package, '', path)
      )
        continue
      const absolute = await safePath(root, path)
      const stat = await lstat(absolute)
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.nlink !== 1 ||
        stat.size > (type === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT) ||
        bytes + stat.size > TOTAL_LIMIT
      )
        continue
      bytes += stat.size
      files.set(path, path)
    }
  }
  try {
    await walk()
  } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error
  }
  return files
}
async function readLegacyAttachment(
  record: ContentRecord,
  path: string,
): Promise<ContentAsset | null> {
  if (!attachmentPath(path) || !kind(path)) return null
  const files = await legacyFiles(record)
  if (!files.has(path)) return null
  const buffer = await boundedRead(
    record.managementDirectory,
    path,
    kind(path) === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT,
  )
  return buffer ? decode(path, buffer) : null
}
async function readLegacyIndex(record: ContentRecord): Promise<ContentAssets> {
  const files = await legacyFiles(record)
  const available = new Set<string>()
  for (const path of files.keys()) {
    const buffer = await boundedRead(
      record.managementDirectory,
      path,
      kind(path) === 'image' ? IMAGE_LIMIT : DOCUMENT_LIMIT,
    )
    if (buffer && decode(path, buffer)) available.add(path)
  }
  return selectIndex(record.package, '', available)
}
