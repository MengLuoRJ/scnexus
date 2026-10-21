import { access, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'))
const rootManifest = JSON.parse(await readFile(resolve(packageRoot, '../../package.json'), 'utf8'))
for (const [name, entry] of [
  ['app-main', 'dist/index.js'],
  ['app-preload', '../app-preload/dist/index.cjs'],
  ['app-renderer-v2', '../app-renderer-v2/dist/index.html'],
]) {
  try {
    await access(resolve(packageRoot, entry))
  } catch (cause) {
    throw new Error(`Missing ${name} build output. Run pnpm build from the workspace root.`, {
      cause,
    })
  }
}
if (manifest.version !== rootManifest.version)
  throw new Error('App version is not synchronized. Run pnpm build:app:prepare.')
console.log('App build outputs and version verified')
