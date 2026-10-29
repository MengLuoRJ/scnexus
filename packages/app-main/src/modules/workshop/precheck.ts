import { Ajv } from 'ajv'
import schema from '@scnexus/standard/package.schema.json' with { type: 'json' }
import { parse } from 'semver'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { isPackage } from '@scnexus/standard/package'
import { sevenZip } from '../../utils/7zip-wrapper'
import { openSource } from '../content-package/source'

const validateSchema = new Ajv({ strict: true }).compile(schema)
export const PART_SIZE = 16 * 1024 * 1024
export const MAX_PACKAGE_SIZE = 300000000
export function assert(condition: unknown, code = 'INVALID_INPUT'): asserts condition {
  if (!condition) throw new Error(code)
}
export async function fingerprint(path: string) {
  const before = await lstat(path)
  assert(
    before.isFile() &&
      !before.isSymbolicLink() &&
      before.size > 0 &&
      before.size <= MAX_PACKAGE_SIZE,
  )
  const sha = createHash('sha256')
  const partMd5: string[] = []
  let md5 = createHash('md5')
  let offset = 0
  for await (const chunk of createReadStream(path)) {
    const buffer = Buffer.from(chunk)
    sha.update(buffer)
    let cursor = 0
    while (cursor < buffer.length) {
      const count = Math.min(PART_SIZE - offset, buffer.length - cursor)
      md5.update(buffer.subarray(cursor, cursor + count))
      cursor += count
      offset += count
      if (offset === PART_SIZE) {
        partMd5.push(md5.digest('base64'))
        md5 = createHash('md5')
        offset = 0
      }
    }
  }
  if (offset) partMd5.push(md5.digest('base64'))
  const after = await lstat(path)
  assert(
    after.size === before.size &&
      after.mtimeMs === before.mtimeMs &&
      after.ctimeMs === before.ctimeMs,
    'LOCAL_FILE_CHANGED',
  )
  return { size: before.size, mtimeMs: before.mtimeMs, sha256: sha.digest('hex'), partMd5 }
}

// JSON.parse accepts duplicate object keys; reject them before accepting a frozen manifest.
export function parseManifest(text: string): Record<string, unknown> {
  let cursor = 0
  const whitespace = () => {
    while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++
  }
  const string = () => {
    const start = cursor++
    while (cursor < text.length) {
      if (text[cursor] === '\\') {
        cursor += 2
        continue
      }
      if (text[cursor++] === '"') return JSON.parse(text.slice(start, cursor)) as string
    }
    throw new Error('INVALID_MANIFEST')
  }
  const value = (depth = 0): void => {
    assert(depth < 64, 'INVALID_MANIFEST')
    whitespace()
    const head = text[cursor]
    if (head === '{' || head === '[') {
      cursor++
      whitespace()
      const close = head === '{' ? '}' : ']'
      const keys = new Set<string>()
      if (text[cursor] === close) {
        cursor++
        return
      }
      while (cursor < text.length) {
        whitespace()
        if (head === '{') {
          assert(text[cursor] === '"', 'INVALID_MANIFEST')
          const key = string()
          assert(!keys.has(key), 'DUPLICATE_MANIFEST_KEY')
          keys.add(key)
          whitespace()
          assert(text[cursor++] === ':', 'INVALID_MANIFEST')
        }
        value(depth + 1)
        whitespace()
        const separator = text[cursor++]
        if (separator === close) return
        assert(separator === ',', 'INVALID_MANIFEST')
      }
      throw new Error('INVALID_MANIFEST')
    }
    if (head === '"') {
      string()
      return
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(cursor),
    )
    assert(match, 'INVALID_MANIFEST')
    cursor += match[0].length
  }
  value()
  whitespace()
  assert(cursor === text.length, 'INVALID_MANIFEST')
  const manifest = JSON.parse(text)
  assert(isPackage(manifest), 'INVALID_MANIFEST')
  assert(validateSchema(manifest), 'INVALID_MANIFEST')
  const version = typeof manifest.version === 'string' ? parse(manifest.version) : null
  assert(
    version &&
      `${version.version}${version.build.length ? '+' + version.build.join('.') : ''}` ===
        manifest.version,
    'INVALID_VERSION',
  )
  return manifest
}
export async function precheckPackage(path: string, githubManifest?: Record<string, unknown>) {
  const info = await lstat(path)
  assert(info.isFile() && !info.isSymbolicLink() && info.size <= MAX_PACKAGE_SIZE && info.size > 0)
  const listing = await sevenZip.list(path)
  listing.entries = listing.entries.map((entry) => ({
    ...entry,
    path: entry.path.replaceAll('\\', '/'),
  }))
  assert(listing.entries.length <= 50000, 'ARCHIVE_LIMIT')
  let expanded = 0
  const names = new Set<string>()
  for (const entry of listing.entries) {
    const name = entry.path.replaceAll('\\', '/')
    assert(
      !name.startsWith('/') && !name.includes(':') && name.split('/').length <= 32,
      'UNSAFE_ARCHIVE',
    )
    for (const part of name.replace(/\/$/, '').split('/')) {
      assert(
        part &&
          part !== '.' &&
          part !== '..' &&
          !/[. ]$/.test(part) &&
          ![...part].some((character) => character.charCodeAt(0) < 32) &&
          !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        'UNSAFE_ARCHIVE',
      )
    }
    assert(!names.has(name.toLowerCase()), 'ARCHIVE_CASE_CONFLICT')
    names.add(name.toLowerCase())
    expanded += entry.size ?? 0
    assert(Number.isSafeInteger(expanded) && expanded <= 4 * 1024 ** 3, 'ARCHIVE_LIMIT')
  }
  const wrapper = githubManifest
    ? listing.entries
        .find((entry) => /^[^/\\]+\/package\.json$/.test(entry.path))
        ?.path.split('/')[0]
    : ''
  assert(
    !githubManifest ||
      (wrapper &&
        listing.entries.every(
          (entry) =>
            entry.path === wrapper ||
            entry.path === wrapper + '/' ||
            entry.path.startsWith(wrapper + '/'),
        )),
    'ROOT_MANIFEST_REQUIRED',
  )
  const descriptor = wrapper ? wrapper + '/package.json' : 'package.json'
  const roots = listing.entries.filter(
    (entry) => entry.path.toLowerCase() === descriptor.toLowerCase(),
  )
  assert(
    roots.length === 1 && roots[0].path === descriptor && (roots[0].size ?? Infinity) <= 128 * 1024,
    'ROOT_MANIFEST_REQUIRED',
  )
  const source = await openSource({ kind: 'archive', path })
  const bytes = await source.read(descriptor)
  assert(bytes.length <= 128 * 1024, 'ROOT_MANIFEST_REQUIRED')
  const manifest = parseManifest(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  assert(
    !githubManifest || JSON.stringify(manifest) === JSON.stringify(githubManifest),
    'GITHUB_MANIFEST_CHANGED',
  )
  for (const category of ['maps', 'mods']) {
    for (const item of (manifest[category] ?? []) as { source_path: string }[]) {
      assert(
        typeof item.source_path === 'string' && /^\/(Maps|Mods)\//.test(item.source_path),
        'INVALID_RESOURCE_PATH',
      )
      const resource = (wrapper ? wrapper + '/' : '') + item.source_path.slice(1)
      assert(
        source.entries.some(
          (entry) => entry.path === resource || entry.path.startsWith(resource + '/'),
        ),
        'MISSING_RESOURCE',
      )
    }
  }
  return { manifest, ...(await fingerprint(path)) }
}
export async function inspectImage(path: string) {
  const stat = await lstat(path)
  assert(
    stat.isFile() && !stat.isSymbolicLink() && stat.size > 0 && stat.size <= 10 * 1024 * 1024,
    'INVALID_IMAGE',
  )
  const file = await open(path, 'r')
  const head = Buffer.alloc(12)
  try {
    await file.read(head, 0, 12, 0)
  } finally {
    await file.close()
  }
  const mime = head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    ? 'image/png'
    : head[0] === 255 && head[1] === 216 && head[2] === 255
      ? 'image/jpeg'
      : head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : null
  assert(mime, 'INVALID_IMAGE')
  return { mime, ...(await fingerprint(path)) }
}
