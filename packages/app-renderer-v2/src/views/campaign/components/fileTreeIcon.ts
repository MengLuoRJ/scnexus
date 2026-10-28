import type { FileTree } from '@scnexus/app-shared/types/content.type'
export function fileTreeIcon(node: FileTree, open: boolean) {
  const name = node.name.toLowerCase()
  if (name.endsWith('.sc2map')) return { icon: 'i-tabler-map', color: 'text-info' }
  if (name.endsWith('.sc2mod')) return { icon: 'i-tabler-puzzle', color: 'text-secondary' }
  if (node.kind === 'directory') {
    if (name === 'maps') return { icon: 'i-tabler-folder', color: 'text-info' }
    if (name === 'mods') return { icon: 'i-tabler-folder', color: 'text-secondary' }
    if (name.endsWith('.sc2data') || name.endsWith('.sc2assets'))
      return { icon: 'i-tabler-database', color: 'text-warning' }
    return { icon: open ? 'i-tabler-folder-open' : 'i-tabler-folder', color: 'text-warning' }
  }
  if (name.endsWith('.json')) return { icon: 'i-tabler-braces', color: 'text-warning' }
  if (/\.(galaxy|xml|sc2layout|sc2style|sc2components)$/.test(name))
    return { icon: 'i-tabler-file-code', color: 'text-primary' }
  if (/\.(dds|tga|png|jpe?g|webp|gif|bmp)$/.test(name))
    return { icon: 'i-tabler-photo', color: 'text-success' }
  if (/\.(ogg|wav|mp3|flac)$/.test(name)) return { icon: 'i-tabler-music', color: 'text-info' }
  if (/\.(zip|7z|rar|mpq|sc2archive)$/.test(name))
    return { icon: 'i-tabler-file-zip', color: 'text-warning' }
  if (/\.(txt|md|ini|strings)$/.test(name))
    return { icon: 'i-tabler-file-text', color: 'text-muted' }
  return { icon: 'i-tabler-file', color: 'text-muted' }
}
