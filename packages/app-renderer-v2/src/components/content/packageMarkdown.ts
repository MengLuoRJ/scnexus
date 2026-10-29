import { createMarkdownParser } from 'comark'
import type { ElementNode, MarkdownDocument, Node } from 'comark'
import type { ContentAsset } from '@scnexus/app-shared/types/content.type'

export function resolvePackageLink(documentPath: string, target: string) {
  let value: string
  try {
    value = decodeURIComponent(target)
  } catch {
    return null
  }
  if (
    /[\\:%?]/u.test(value) ||
    [...value].some((char) => char.charCodeAt(0) < 32) ||
    value.startsWith('//')
  )
    return null
  const [pathname = '', fragment = ''] = value.split('#')
  const parts = pathname.startsWith('/') ? [] : documentPath.split('/').slice(0, -1)
  if (!pathname) return { path: documentPath, fragment }
  for (const part of pathname.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(part)
  }
  return parts.length ? { path: parts.join('/'), fragment } : null
}

export function packageImageData(asset: ContentAsset | null): string | null {
  if (!asset) return null
  if (!/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/i.test(asset.mime)) return null
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data) || !asset.data) return null
  return `data:${asset.mime};base64,${asset.data}`
}

// Package text is untrusted: do not register Comark's HTML, MDC or attribute plugins.
const parse = createMarkdownParser({ registerDefaultPlugins: false, linkify: false })
const allowedTags = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'a',
  'img',
])

export async function renderPackageMarkdown(
  source: string,
  documentPath: string,
  load: (path: string) => Promise<ContentAsset | null>,
): Promise<{ document: MarkdownDocument; missingImages: boolean }> {
  const parsed = await parse(source)
  let missingImages = false
  const images = new Map<string, Promise<string | null>>()
  const headings = new Map<string, number>()
  const text = (nodes: Node[]): string =>
    nodes.map((node) => (typeof node === 'string' ? node : text(node.slice(2) as Node[]))).join('')
  async function sanitize(node: Node): Promise<Node> {
    if (typeof node === 'string') return node
    const [tag, attrs, ...children] = node
    if (!tag || !allowedTags.has(tag)) return ''
    const clean: ElementNode = [tag, {}, ...(await Promise.all(children.map(sanitize)))]
    // Rebuild attributes rather than allowing component overrides, bindings or event handlers.
    if (/^h[1-6]$/.test(tag)) {
      const slug = text(children)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\s-]/gu, '')
        .replace(/\s+/g, '-')
      const count = headings.get(slug) ?? 0
      headings.set(slug, count + 1)
      clean[1].id = count ? `${slug}-${count}` : slug
    }
    if (tag === 'a') {
      const resolved =
        typeof attrs.href === 'string' && resolvePackageLink(documentPath, attrs.href)
      if (resolved && /\.(md|txt)$/i.test(resolved.path)) {
        clean[1] = {
          href: '#',
          'data-package-path': resolved.path,
          'data-package-fragment': resolved.fragment,
        }
      } else clean[1] = { 'aria-disabled': 'true' }
    }
    if (tag === 'img') {
      const resolved = typeof attrs.src === 'string' && resolvePackageLink(documentPath, attrs.src)
      let url: string | null = null
      if (resolved) {
        if (!images.has(resolved.path)) {
          images.set(
            resolved.path,
            load(resolved.path)
              .then(packageImageData)
              .catch(() => null),
          )
        }
        url = await images.get(resolved.path)!
      }
      if (!url) {
        missingImages = true
        return typeof attrs.alt === 'string' ? attrs.alt : text(children)
      }
      clean[1] = {
        src: url,
        alt: typeof attrs.alt === 'string' ? attrs.alt : text(children),
        loading: 'lazy',
      }
    }
    if (tag === 'ol' && typeof attrs.start === 'number') clean[1].start = attrs.start
    return clean
  }
  const nodes = await Promise.all(parsed.nodes.map(sanitize))
  return { document: { nodes, frontmatter: {}, meta: {} }, missingImages }
}
