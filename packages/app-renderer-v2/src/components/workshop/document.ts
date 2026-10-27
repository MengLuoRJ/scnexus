export type RichNode = {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: RichNode[]
}
export type WorkshopDocument = RichNode & { type: 'doc' }
export const emptyDocument = (): WorkshopDocument => ({ type: 'doc', content: [] })
export function validateDocument(value: unknown): WorkshopDocument {
  if (new TextEncoder().encode(JSON.stringify(value)).length > 262144) throw new Error('document')
  let count = 0
  const containers = [
    'doc',
    'paragraph',
    'heading',
    'blockquote',
    'bulletList',
    'orderedList',
    'listItem',
    'codeBlock',
  ]
  const exact = (obj: Record<string, unknown>, allowed: string[]) => {
    if (Object.keys(obj).some((key) => !allowed.includes(key))) throw new Error('document')
  }
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('document')
    return v as Record<string, unknown>
  }
  function visit(v: unknown, depth: number) {
    const n = object(v)
    if (++count > 5000 || depth > 16 || typeof n.type !== 'string') throw new Error('document')
    exact(n, ['type', 'text', 'attrs', 'marks', 'content'])
    if (n.type === 'image') {
      exact(n, ['type', 'attrs'])
      const a = object(n.attrs)
      exact(a, ['fileId', 'alt'])
      if (
        typeof a.fileId !== 'string' ||
        !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(a.fileId) ||
        (a.alt !== undefined && (typeof a.alt !== 'string' || a.alt.length > 200))
      )
        throw new Error('document')
      return
    }
    if (n.type === 'text') {
      if (
        typeof n.text !== 'string' ||
        n.text.length > 32768 ||
        n.content !== undefined ||
        n.attrs !== undefined
      )
        throw new Error('document')
      if (n.marks !== undefined) {
        if (!Array.isArray(n.marks) || n.marks.length > 6) throw new Error('document')
        for (const mark of n.marks) {
          const m = object(mark)
          exact(m, ['type', 'attrs'])
          if (m.type === 'link') {
            const a = object(m.attrs)
            exact(a, ['href'])
            if (typeof a.href !== 'string' || a.href.length > 2048 || !/^https?:\/\//i.test(a.href))
              throw new Error('document')
            const url = new URL(a.href)
            if (url.username || url.password) throw new Error('document')
          } else if (
            !['bold', 'italic', 'strike', 'code', 'underline'].includes(String(m.type)) ||
            m.attrs !== undefined
          )
            throw new Error('document')
        }
      }
      return
    }
    if (
      (!containers.includes(n.type) && !['hardBreak', 'horizontalRule'].includes(n.type)) ||
      (depth > 0 && n.type === 'doc') ||
      n.text !== undefined ||
      n.marks !== undefined
    )
      throw new Error('document')
    if (n.attrs !== undefined) {
      const a = object(n.attrs)
      if (n.type === 'heading') {
        exact(a, ['level'])
        if (![1, 2, 3, 4, 5, 6].includes(Number(a.level))) throw new Error('document')
      } else if (n.type === 'orderedList') {
        exact(a, ['start'])
        if (!Number.isSafeInteger(a.start) || Number(a.start) < 1 || Number(a.start) > 100000)
          throw new Error('document')
      } else throw new Error('document')
    }
    if (n.content !== undefined) {
      if (!Array.isArray(n.content) || !containers.includes(n.type)) throw new Error('document')
      n.content.forEach((child) => visit(child, depth + 1))
    }
  }
  if (!value || (value as RichNode).type !== 'doc') throw new Error('document')
  visit(value, 0)
  return value as WorkshopDocument
}
export function documentFileIds(document: WorkshopDocument): string[] {
  const ids = new Set<string>()
  function visit(node: RichNode) {
    if (node.type === 'image') ids.add(String(node.attrs?.fileId))
    node.content?.forEach(visit)
  }
  visit(document)
  return [...ids]
}
// Strip editor-only default attributes, never silently strip unsupported node types.
export function editorDocument(node: RichNode): WorkshopDocument {
  function clean(n: RichNode): RichNode {
    return {
      type: n.type,
      ...(n.text === undefined ? {} : { text: n.text }),
      ...(n.content ? { content: n.content.map(clean) } : {}),
      ...(n.attrs && n.type === 'heading' ? { attrs: { level: n.attrs.level } } : {}),
      ...(n.attrs && n.type === 'orderedList' ? { attrs: { start: n.attrs.start } } : {}),
      ...(n.type === 'image'
        ? { attrs: { fileId: n.attrs?.fileId, alt: n.attrs?.alt ?? '' } }
        : {}),
      ...(n.marks
        ? {
            marks: n.marks.map((m) =>
              m.type === 'link'
                ? { type: m.type, attrs: { href: m.attrs?.href } }
                : { type: m.type },
            ),
          }
        : {}),
    }
  }
  return validateDocument(clean(node))
}
