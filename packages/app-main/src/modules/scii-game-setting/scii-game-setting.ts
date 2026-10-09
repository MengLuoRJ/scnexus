import { join, resolve, isAbsolute } from 'node:path'
import { stat, mkdir, realpath } from 'node:fs/promises'
import { sciiGameSettingRepository } from '../../stores/scii-game-setting'
import type { GamePaths } from '@scnexus/app-shared/types/content.type'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { initGameStore } from '../../stores'

let configured: (() => Promise<void>) | undefined
export function onGameConfigured(callback?: () => Promise<void>) {
  configured = callback
}
async function startDependents() {
  try {
    await configured?.()
  } catch (cause) {
    throw new AppError(ERRORS.GAME_MODULE_INITIALIZATION_FAILED, {}, { cause })
  }
}
let busy = false
export async function withGameLock<T>(run: () => Promise<T>): Promise<T> {
  if (busy) throw new AppError(ERRORS.TASK_CONFLICT)
  busy = true
  try {
    return await run()
  } finally {
    busy = false
  }
}
export function gamePaths(root: string, documents: string, revision = 0): GamePaths {
  return {
    _revision: revision,
    gameRoot: root,
    mapsRoot: join(root, 'Maps'),
    modsRoot: join(root, 'Mods'),
    customizeDataRoot: join(root, 'SCNexusCustomizeData'),
    ccmRoot: join(root, 'Maps', 'CustomCampaigns'),
    client: join(root, 'StarCraft II.exe'),
    switcher: join(root, 'Support64', 'SC2Switcher_x64.exe'),
    editor: join(root, 'Support64', 'SC2Editor_x64.exe'),
    documentsRoot: join(documents, 'StarCraft II'),
    banksRoot: join(documents, 'StarCraft II', 'Banks'),
    arcadeBanksRoot: join(documents, 'StarCraft II', 'ArcadeBanks'),
  }
}
export async function getGamePaths(): Promise<GamePaths> {
  const data = sciiGameSettingRepository.getSnapshot()
  if (!data.gameRoot) throw new AppError(ERRORS.PROFILE_NOT_READY)
  try {
    if (!(await stat(join(data.gameRoot, 'StarCraft II.exe'))).isFile())
      throw new Error('Missing client')
  } catch (cause) {
    throw new AppError(ERRORS.PROFILE_GAME_ROOT_INVALID, {}, { cause })
  }
  return gamePaths(data.gameRoot, data.documentRoot, data._revision)
}
export async function configureGame(input: unknown) {
  if (busy) throw new AppError(ERRORS.PROFILE_CHANGE_BLOCKED)
  if (typeof input !== 'string' || !isAbsolute(input))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return withGameLock(() => configureUnlocked(input))
}
async function configureUnlocked(input: string) {
  let root: string
  try {
    root = await realpath(resolve(input))
    if (!(await stat(join(root, 'StarCraft II.exe'))).isFile()) throw new Error('Invalid client')
  } catch (cause) {
    throw new AppError(ERRORS.PROFILE_GAME_ROOT_INVALID, {}, { cause })
  }
  const old = sciiGameSettingRepository.getSnapshot()
  const paths = gamePaths(root, old.documentRoot)
  try {
    for (const dir of [paths.mapsRoot, paths.modsRoot, paths.customizeDataRoot, paths.ccmRoot])
      await mkdir(dir, { recursive: true })
  } catch (cause) {
    throw new AppError(ERRORS.GAME_DIRECTORY_PREPARATION_FAILED, {}, { cause })
  }
  sciiGameSettingRepository.update({
    ...old,
    gameRoot: root,
    customizeDataRoot: paths.customizeDataRoot,
    confirmedAt: Date.now(),
  })
  await startDependents()
  return getGameSnapshot()
}
export async function getGameSnapshot() {
  const setting = sciiGameSettingRepository.getSnapshot()
  try {
    const paths = await getGamePaths()
    const capabilities = { client: true, switcher: false, editor: false }
    for (const key of ['switcher', 'editor'] as const) {
      try {
        capabilities[key] = (await stat(paths[key])).isFile()
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
    return { ...setting, paths, capabilities }
  } catch (error) {
    if (
      error instanceof AppError &&
      [ERRORS.PROFILE_NOT_READY.code, ERRORS.PROFILE_GAME_ROOT_INVALID.code].some(
        (code) => code === error.code,
      )
    )
      return {
        ...setting,
        paths: null,
        capabilities: { client: false, switcher: false, editor: false },
      }
    throw error
  }
}
export async function initializeGame() {
  return withGameLock(discoverGame)
}
async function discoverGame() {
  const data = sciiGameSettingRepository.getSnapshot()
  if (data.gameRoot) return configureUnlocked(data.gameRoot)
  if (process.platform !== 'win32') throw new AppError(ERRORS.PROFILE_NOT_READY)
  let value: unknown
  try {
    const { default: reg } = await import('../../utils/reg')
    const key =
      'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\StarCraft II'
    value = (await reg.list([key]))[key]?.values?.InstallLocation?.value
  } catch (cause) {
    throw new AppError(ERRORS.GAME_DISCOVERY_FAILED, {}, { cause })
  }
  if (typeof value !== 'string' || !value) throw new AppError(ERRORS.PROFILE_NOT_READY)
  return configureUnlocked(value)
}
export async function reinitializeGame(input?: unknown) {
  if (input !== undefined && (typeof input !== 'string' || !isAbsolute(input)))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return withGameLock(async () => {
    await initGameStore(true)
    return input === undefined ? discoverGame() : configureUnlocked(input as string)
  })
}
