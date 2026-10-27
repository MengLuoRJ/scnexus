import { join } from 'node:path'
import { getApplicationDataDirectory } from '../utils/application-data'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import { createElectronBackend } from './store-electron-backend'
import { settingRepository, configureSettingDefaults } from './setting'
import { sciiGameSettingRepository, configureGameDefaults } from './scii-game-setting'
import { existsSync, copyFileSync, constants } from 'node:fs'
import { campaignRepository } from './campaign'
import { campaignActiveRepository } from './campaign-active'
import { dependencyRepository } from './dependency'
import { customizeRepository } from './customize'

let initialization: Promise<void> | undefined

/** Must be awaited after app.whenReady(), before starting business modules. */
export function initAllStores(): Promise<void> {
  initialization ??= initialize().catch((cause) => {
    initialization = undefined
    throw cause
  })
  return initialization
}

export async function initGameStore(reload = false): Promise<void> {
  const { app } = await import('electron')
  if (!app.isReady()) throw new AppError(ERRORS.APP_INITIALIZATION_FAILED)
  configureGameDefaults(
    process.platform === 'darwin'
      ? join(app.getPath('home'), 'Library', 'Application Support', 'Blizzard')
      : app.getPath('documents'),
  )
  const directory = join(getApplicationDataDirectory(), 'SCNexusStorage')
  const backend = await createElectronBackend('store-scii-game-setting', directory)
  if (reload) sciiGameSettingRepository.reload(backend)
  else sciiGameSettingRepository.init(backend)
}

export async function initContentStores(): Promise<void> {
  const { app } = await import('electron')
  if (!app.isReady()) throw new AppError(ERRORS.APP_INITIALIZATION_FAILED)
  const directory = join(getApplicationDataDirectory(), 'SCNexusStorage')
  for (const [name, repository] of [
    ['store-campaign', campaignRepository],
    ['store-campaign-active', campaignActiveRepository],
    ['store-customize', customizeRepository],
    ['store-dependency', dependencyRepository],
  ] as const) {
    if (!repository.isInitialized()) repository.init(await createElectronBackend(name, directory))
  }
}

async function initialize(): Promise<void> {
  const { app } = await import('electron')
  if (!app.isReady())
    throw new AppError(ERRORS.APP_INITIALIZATION_FAILED, {
      message: 'Stores require app readiness',
    })
  const directory = join(getApplicationDataDirectory(), 'SCNexusStorage')
  configureSettingDefaults(app.getPath('downloads'))
  configureGameDefaults(
    process.platform === 'darwin'
      ? join(app.getPath('home'), 'Library', 'Application Support', 'Blizzard')
      : app.getPath('documents'),
  )
  const oldProfile = join(directory, 'store-profile.json')
  const gameFile = join(directory, 'store-scii-game-setting.json')
  if (!existsSync(gameFile) && existsSync(oldProfile))
    copyFileSync(oldProfile, gameFile, constants.COPYFILE_EXCL)
  const failures: unknown[] = []
  for (const [name, repository] of [
    ['store-setting', settingRepository],
    ['store-scii-game-setting', sciiGameSettingRepository],
    ['store-campaign', campaignRepository],
    ['store-campaign-active', campaignActiveRepository],
    ['store-customize', customizeRepository],
    ['store-dependency', dependencyRepository],
  ] as const) {
    try {
      repository.init(await createElectronBackend(name, directory))
    } catch (error) {
      failures.push(error)
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Store initialization failed')
}
