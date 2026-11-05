import type { PackageLocalization } from '@scnexus/standard/package'
import { validateDocument, type RichNode, type WorkshopDocument } from './document'
export type { PackageLocalization }
export function validateDisplayChangelog(value: unknown): WorkshopDocument {
  const document = validateDocument(value)
  function visit(node: RichNode) {
    if (
      node.type === 'image' ||
      node.type === 'horizontalRule' ||
      node.marks?.some((mark) => mark.type === 'link')
    )
      throw new Error('changelog')
    if (node.type === 'heading' && node.attrs && !Number.isInteger(node.attrs.level))
      throw new Error('changelog')
    node.content?.forEach(visit)
  }
  visit(document)
  return document
}
export function parseDisplayMetadata(
  tags: unknown,
  localization: unknown,
): { tags: string[]; localization: PackageLocalization[] } {
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string')) throw new Error('tags')
  if (!Array.isArray(localization)) throw new Error('localization')
  const keys = ['locale', 'name', 'description', 'author', 'version', 'translators']
  for (const item of localization) {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      typeof item.locale !== 'string' ||
      Object.keys(item).some((key) => !keys.includes(key))
    )
      throw new Error('localization')
    for (const key of keys.slice(1, 5))
      if (item[key] !== undefined && typeof item[key] !== 'string') throw new Error('localization')
    if (
      item.translators !== undefined &&
      (!Array.isArray(item.translators) ||
        !item.translators.every((name: unknown) => typeof name === 'string'))
    )
      throw new Error('localization')
  }
  if (new TextEncoder().encode(JSON.stringify({ tags, localization })).length > 131072)
    throw new Error('metadata')
  return { tags, localization: localization as PackageLocalization[] }
}
