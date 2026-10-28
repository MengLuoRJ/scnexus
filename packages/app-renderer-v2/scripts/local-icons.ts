import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Nuxt's template scan misses icons selected in TypeScript helpers and some defaults.
export function localIconNames(root: string, defaults: Record<string, string>): string[] {
  const names = new Set(Object.values(defaults))
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory() && entry.name !== '__tests__') visit(path)
      else if (entry.isFile() && /\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        for (const match of readFileSync(path, 'utf8').matchAll(
          /\bi-tabler-[a-z0-9]+(?:-[a-z0-9]+)*/g,
        ))
          names.add(match[0])
      }
    }
  }
  visit(join(root, 'src'))
  return [...names].sort()
}
