import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin } from 'vite'

export interface ThirdPartyLicense {
  name: string
  version: string
  license: string
  text: string
  source: string
}

interface Manifest {
  name: string
  version: string
  license?: string
  dependencies?: Record<string, string>
}

function manifest(directory: string): Manifest {
  return JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as Manifest
}

export function collectThirdPartyLicenses(root: string): {
  entries: ThirdPartyLicense[]
  files: string[]
} {
  const files = new Set<string>()
  const entries = new Map<string, ThirdPartyLicense>()
  function read(path: string) {
    files.add(path)
    return readFileSync(path, 'utf8').trim()
  }
  function add(name: string, version: string, license: string, paths: string[], source?: string) {
    const text = paths.map(read).join('\n\n')
    if (!text) throw new Error(`Empty license text: ${name}@${version}`)
    entries.set(`${name}@${version}`, {
      name,
      version,
      license,
      text,
      source: source ?? paths.map((path) => relative(root, path).replaceAll('\\', '/')).join(', '),
    })
  }
  // Inspect only direct production dependencies. Walking their dependency graph would list tools not shipped by our renderer bundles.
  for (const name of ['app-main', 'app-preload', 'app-renderer-v2']) {
    const directory = join(root, 'packages', name)
    files.add(join(directory, 'package.json'))
    for (const dependency of Object.keys(manifest(directory).dependencies ?? {})) {
      const location = realpathSync(join(directory, 'node_modules', dependency))
      const pkg = manifest(location)
      if (dependency.startsWith('@scnexus/')) continue
      files.add(join(location, 'package.json'))
      const licenses = readdirSync(location)
        .filter((file) => /^(?:licen[sc]e|copying|notice|copyright)(?:[.-]|$)/i.test(file))
        .sort()
        .map((file) => join(location, file))
      if (!licenses.length) throw new Error(`Missing license text: ${pkg.name}@${pkg.version}`)
      const text = licenses.map(read).join('\n\n')
      const license = pkg.license ?? (/^MIT License\b/.test(text) ? 'MIT' : '')
      if (!license) throw new Error(`Missing license identifier: ${pkg.name}@${pkg.version}`)
      add(
        pkg.name,
        pkg.version,
        license,
        licenses,
        licenses
          .map((file) => `npm:${pkg.name}@${pkg.version}/${relative(location, file)}`)
          .join(', '),
      )
    }
  }
  const electron = join(root, 'node_modules', 'electron')
  files.add(join(electron, 'package.json'))
  add(
    'Electron',
    manifest(electron).version,
    'MIT',
    [join(electron, 'dist', 'LICENSE')],
    'Electron binary distribution: LICENSE',
  )
  const sevenZip = join(root, 'packages', 'app-main', 'node_modules', '7z-bin')
  const sevenZipLicenses = readdirSync(join(sevenZip, 'bin'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((platform) =>
      readdirSync(join(sevenZip, 'bin', platform.name), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((arch) => join(sevenZip, 'bin', platform.name, arch.name, 'License.txt')),
    )
  const binaryTexts = new Map<string, string>()
  for (const file of sevenZipLicenses) binaryTexts.set(read(file), file)
  const binaryVersion = JSON.parse(read(join(sevenZip, 'bin', 'version.json'))) as {
    version: string
  }
  add(
    '7-Zip binaries',
    binaryVersion.version,
    'LGPL-2.1-or-later / BSD / unRAR restriction',
    [
      ...binaryTexts.values(),
      join(root, 'packages', 'app-renderer-v2', 'scripts', 'licenses', 'LGPL-2.1.txt'),
    ],
    '7z-bin/bin/<platform>/<arch>/License.txt; https://www.gnu.org/licenses/old-licenses/lgpl-2.1.txt',
  )
  const iconDirectory = join(
    root,
    'packages',
    'app-renderer-v2',
    'node_modules',
    '@iconify-json',
    'tabler',
  )
  const iconManifest = JSON.parse(read(join(iconDirectory, 'package.json'))) as Manifest & {
    iconSetVersion: string
  }
  add(
    'Tabler Icons',
    iconManifest.iconSetVersion,
    'MIT',
    [
      join(
        root,
        'packages',
        'app-renderer-v2',
        'scripts',
        'licenses',
        `tabler-icons-${iconManifest.iconSetVersion}.txt`,
      ),
    ],
    `https://github.com/tabler/tabler-icons/blob/v${iconManifest.iconSetVersion}/LICENSE`,
  )
  add('libbz2', '1.0.8', 'bzip2', [join(root, 'packages', 'bzip2-wasm', 'LICENSE.libbz2')])
  const wasmPackage = join(root, 'packages', 'bzip2-wasm')
  files.add(join(wasmPackage, 'package.json'))
  add(
    'Emscripten runtime (bzip2-wasm)',
    `bzip2-wasm ${manifest(wasmPackage).version}`,
    'MIT / NCSA',
    [join(wasmPackage, 'LICENSE.runtime')],
  )
  const protocolData = read(
    join(root, 'packages', 'replay-parser', 'src', 'protocols', 'official-data.ts'),
  )
  const protocolCommit =
    /^\/\/ Blizzard s2protocol ([a-f0-9]{40}); MIT, see LICENSE\.s2protocol\./.exec(
      protocolData,
    )?.[1]
  if (!protocolCommit) throw new Error('Missing s2protocol source commit in official-data.ts')
  add('Blizzard s2protocol-derived definitions', protocolCommit, 'MIT', [
    join(root, 'packages', 'replay-parser', 'LICENSE.s2protocol'),
  ])
  return {
    entries: [...entries.values()].sort(
      (a, b) => a.name.localeCompare(b.name, 'en') || a.version.localeCompare(b.version, 'en'),
    ),
    files: [...files],
  }
}

export function thirdPartyLicenses(root: string): Plugin {
  const id = 'virtual:third-party-licenses'
  return {
    name: 'scnexus-third-party-licenses',
    resolveId(source) {
      if (source === id) return `\0${id}`
    },
    load(source) {
      if (source !== `\0${id}`) return
      const { entries, files } = collectThirdPartyLicenses(root)
      for (const file of files) this.addWatchFile(file)
      return `export default ${JSON.stringify(entries)}`
    },
  }
}
