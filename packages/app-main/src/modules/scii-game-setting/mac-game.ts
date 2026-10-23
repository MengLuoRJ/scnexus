import { access, readFile, readdir, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'

export async function macExecutable(path: string): Promise<boolean> {
  try {
    if (!(await stat(path)).isFile()) return false
    await access(path, constants.X_OK)
    return true
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? ''))
      return false
    throw error
  }
}
async function directory(path: string) {
  try {
    return (await stat(path)).isDirectory()
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false
    throw error
  }
}
export async function macGameRoot(input: string): Promise<string> {
  let root = await realpath(input)
  if (basename(root).endsWith('.app')) {
    root = dirname(root)
    if (/^Base\d+$/.test(basename(root)) && basename(dirname(root)) === 'Versions')
      root = dirname(dirname(root))
  }
  if (
    !(await directory(root)) ||
    !(
      (await directory(join(root, 'SC2.app'))) ||
      (await directory(join(root, 'StarCraft II.app'))) ||
      (await directory(join(root, 'Versions')))
    )
  )
    throw new Error('Invalid macOS game root')
  return root
}
export async function macGameExecutables(root: string) {
  let versions: string[] = []
  try {
    versions = (await readdir(join(root, 'Versions')))
      .filter((name) => /^Base\d+$/.test(name))
      .sort((a, b) => Number(b.slice(4)) - Number(a.slice(4)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  const clientCandidates = [
    ...versions.map((name) => join(root, 'Versions', name, 'SC2.app', 'Contents', 'MacOS', 'SC2')),
    join(root, 'SC2.app', 'Contents', 'MacOS', 'SC2'),
    join(root, 'StarCraft II.app', 'Contents', 'MacOS', 'StarCraft II'),
  ]
  async function first(paths: string[]) {
    for (const path of paths) if (await macExecutable(path)) return path
    return ''
  }
  return {
    client: await first(clientCandidates),
    switcher: await first(
      ['Support', 'Support64'].flatMap((folder) => [
        join(root, folder, 'SC2Switcher.app', 'Contents', 'MacOS', 'SC2Switcher'),
        join(root, folder, 'SC2Switcher'),
      ]),
    ),
    editor: await first([
      join(root, 'StarCraft II Editor.app', 'Contents', 'MacOS', 'StarCraft II Editor'),
      join(root, 'Support', 'SC2Editor.app', 'Contents', 'MacOS', 'SC2Editor'),
    ]),
  }
}
async function readOptional(path: string, limit: number) {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size > limit) return null
    return await readFile(path, 'utf8')
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? ''))
      return null
    throw error
  }
}
export async function discoverMacGame(home: string): Promise<string | null> {
  const candidates: string[] = []
  for (const data of [
    join(home, 'Library', 'Application Support', 'Blizzard', 'StarCraft II'),
    join(home, 'Documents', 'StarCraft II'),
  ]) {
    const text = await readOptional(join(data, 'ExecuteInfo.txt'), 65536)
    const executable = text?.match(/^\s*executable\s*=\s*"?([^"\r\n]+)"?\s*$/im)?.[1]?.trim()
    const index = executable?.indexOf('/Versions/') ?? -1
    if (executable && index > 0 && isAbsolute(executable))
      candidates.push(executable.slice(0, index))
  }
  const config = await readOptional(
    join(home, 'Library', 'Application Support', 'Battle.net', 'Battle.net.config'),
    4 * 1024 * 1024,
  )
  if (config) {
    try {
      const data = JSON.parse(config) as {
        Client?: { Install?: { Default?: { s2?: { InstallPath?: unknown } } } }
      }
      const path = data.Client?.Install?.Default?.s2?.InstallPath
      if (typeof path === 'string' && isAbsolute(path)) candidates.push(path)
    } catch {
      /* An incomplete launcher config is not an installation record. */
    }
  }
  candidates.push('/Applications/StarCraft II', join(home, 'Applications', 'StarCraft II'))
  for (const candidate of new Set(candidates)) {
    try {
      const root = await macGameRoot(candidate)
      if ((await macGameExecutables(root)).client) return root
    } catch (error) {
      if (
        !['ENOENT', 'ENOTDIR', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '') &&
        (error as Error).message !== 'Invalid macOS game root'
      )
        throw error
    }
  }
  return null
}

export async function macResourceRoot(root: string, name: 'Maps' | 'Mods'): Promise<string> {
  const entries = (await readdir(root, { withFileTypes: true })).filter(
    (entry) => entry.name.toLowerCase() === name.toLowerCase(),
  )
  if (entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink()))
    throw new Error('Resource root must be a regular directory')
  if (entries.length > 1) throw new Error(`Ambiguous resource directories: ${name}`)
  return join(root, entries[0]?.name ?? name)
}
