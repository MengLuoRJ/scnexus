import { extname } from 'node:path'
import type {
  WorkshopDisplayChangelogNode as Node,
  WorkshopPackageSelection,
} from '@scnexus/app-shared/types/workshop.type'
import type { ContentSource } from '../content-package/source'
import { logicalPath } from '../content-package/paths'
import { sevenZip } from '../../utils/7zip-wrapper'

export const DISPLAY_CHANGELOG_MAX_BYTES = 262144

type Marks = NonNullable<Node['marks']>
function inline(text: string, depth = 0, marks: Marks = []): Node[] {
  if (depth > 12) throw new Error('CHANGELOG_DEPTH')
  const nodes: Node[] = []
  const append = (value: string) => {
    for (let start = 0; start < value.length; start += 32768)
      nodes.push({
        type: 'text',
        text: value.slice(start, start + 32768),
        ...(marks.length ? { marks } : {}),
      })
  }
  let plain = ''
  const flush = () => {
    if (plain) append(plain)
    plain = ''
  }
  for (let i = 0; i < text.length;) {
    if (text[i] === '\\' && i + 1 < text.length) {
      plain += text[i + 1]
      i += 2
      continue
    }
    const image = text.startsWith('![', i)
    if (image || text[i] === '[') {
      const start = i + (image ? 2 : 1)
      const end = text.indexOf(']', start)
      if (end < 0 || text[end + 1] !== '(') throw new Error('UNSUPPORTED_CHANGELOG_LINK')
      let close = end + 2
      let nesting = 1
      for (; close < text.length && nesting; close++) {
        if (text[close] === '\\') {
          close++
          continue
        }
        if (text[close] === '(') nesting++
        if (text[close] === ')') nesting--
      }
      if (nesting) throw new Error('UNSUPPORTED_CHANGELOG_LINK')
      flush()
      nodes.push(...inline(text.slice(start, end), depth + 1, marks))
      i = close
      continue
    }
    const token = ['**', '__', '~~', '`', '*', '_'].find((value) => text.startsWith(value, i))
    if (token) {
      const end = text.indexOf(token, i + token.length)
      if (end > i + token.length) {
        flush()
        const type =
          token === '`'
            ? 'code'
            : token.length === 1
              ? 'italic'
              : token === '~~'
                ? 'strike'
                : 'bold'
        const next: Marks = marks.some((mark) => mark.type === type) ? marks : [...marks, { type }]
        const value = text.slice(i + token.length, end)
        if (type === 'code') {
          for (let start = 0; start < value.length; start += 32768)
            nodes.push({ type: 'text', text: value.slice(start, start + 32768), marks: next })
        } else nodes.push(...inline(value, depth + 1, next))
        i = end + token.length
        continue
      }
    }
    plain += text[i++]
  }
  flush()
  return nodes
}

function blocks(text: string, markdown: boolean, depth = 0): Node[] {
  if (depth > 12) throw new Error('CHANGELOG_DEPTH')
  const lines = text.split('\n')
  const content: Node[] = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }
    const fence = markdown && /^\s*(`{3,}|~{3,})[^`~]*$/.exec(line)
    if (fence) {
      const code: string[] = []
      i++
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i]!))
        code.push(lines[i++]!)
      if (i === lines.length) throw new Error('UNCLOSED_CHANGELOG_CODE')
      content.push({
        type: 'codeBlock',
        content: code.length ? [{ type: 'text', text: code.join('\n') }] : [],
      })
      i++
      continue
    }
    if (markdown && /^\s*>/.test(line)) {
      const quoted: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i]!))
        quoted.push(lines[i++]!.replace(/^\s*> ?/, ''))
      content.push({ type: 'blockquote', content: blocks(quoted.join('\n'), true, depth + 1) })
      continue
    }
    const heading = markdown && /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line)
    if (heading) {
      content.push({
        type: 'heading',
        attrs: { level: heading[1]!.length },
        content: inline(heading[2]!),
      })
      i++
      continue
    }
    const list = markdown && /^\s*(?:([-+*])|([0-9]+)[.)])\s+(.+)$/.exec(line)
    if (list) {
      const ordered = !!list[2]
      const start = ordered ? Number(list[2]) : 1
      if (!Number.isSafeInteger(start) || start < 1 || start > 100000)
        throw new Error('CHANGELOG_LIST_START')
      const items: Node[] = []
      while (i < lines.length) {
        const item = /^\s*(?:([-+*])|([0-9]+)[.)])\s+(.+)$/.exec(lines[i]!)
        if (!item || !!item[2] !== ordered) break
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inline(item[3]!) }],
        })
        i++
      }
      content.push({
        type: ordered ? 'orderedList' : 'bulletList',
        ...(ordered ? { attrs: { start } } : {}),
        content: items,
      })
      continue
    }
    content.push({
      type: 'paragraph',
      content: markdown ? inline(line) : [{ type: 'text', text: line }],
    })
    i++
  }
  return content
}

export function convertDisplayChangelog(
  bytes: Uint8Array,
  extension: string,
): NonNullable<WorkshopPackageSelection['displayChangelog']> {
  if (
    bytes.length > DISPLAY_CHANGELOG_MAX_BYTES ||
    !['.txt', '.md', '.markdown'].includes(extension)
  )
    throw new Error('UNSUPPORTED_CHANGELOG')
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replaceAll('\r\n', '\n')
  // Unsupported HTML, reference links and tables require manual entry, never HTML evaluation.
  if (
    [...text].some((character) => character.charCodeAt(0) < 32 && !'\t\n\r'.includes(character)) ||
    /<[^>]*>|^\s*\[[^\]]+\]:|^\s*\|.*\|/m.test(text)
  )
    throw new Error('UNSUPPORTED_CHANGELOG')
  const doc = { type: 'doc' as const, content: blocks(text, extension !== '.txt') }
  let count = 0
  const visit = (node: Node, depth: number) => {
    if (
      ++count > 5000 ||
      depth > 16 ||
      (node.text?.length ?? 0) > 32768 ||
      (node.marks?.length ?? 0) > 6
    )
      throw new Error('CHANGELOG_LIMIT')
    node.content?.forEach((child) => visit(child, depth + 1))
  }
  visit(doc, 0)
  if (Buffer.byteLength(JSON.stringify(doc), 'utf8') > DISPLAY_CHANGELOG_MAX_BYTES)
    throw new Error('CHANGELOG_LIMIT')
  return doc
}

export async function readDisplayChangelog(
  source: ContentSource,
  manifest: Record<string, unknown>,
): Promise<Pick<WorkshopPackageSelection, 'displayChangelog' | 'displayChangelogWarning'>> {
  if (manifest.changelog === undefined) return {}
  try {
    if (source.input.kind !== 'archive') throw new Error('ARCHIVE_REQUIRED')
    const reference = manifest.changelog
    if (typeof reference !== 'string' || /^[\\/]/.test(reference) || /[*?]/.test(reference))
      throw new Error('UNSAFE_CHANGELOG_PATH')
    const path = logicalPath(reference)
    const entry = source.entries.find((entry) => entry.path === path)
    if (
      !entry ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 0 ||
      entry.bytes > DISPLAY_CHANGELOG_MAX_BYTES
    )
      throw new Error('CHANGELOG_LIMIT')
    const extension = extname(path).toLowerCase()
    if (!['.txt', '.md', '.markdown'].includes(extension)) throw new Error('UNSUPPORTED_CHANGELOG')
    // openSource already rejects archive links and validates every entry; read only this exact member to stdout.
    const bytes = await sevenZip.readFile(source.input.path, path, {
      maxBytes: DISPLAY_CHANGELOG_MAX_BYTES,
      timeout: 120000,
    })
    if (bytes.length !== entry.bytes) throw new Error('CHANGELOG_CHANGED')
    return { displayChangelog: convertDisplayChangelog(bytes, extension) }
  } catch {
    return { displayChangelogWarning: true }
  }
}
