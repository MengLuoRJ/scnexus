import { rename } from 'node:fs/promises'
import { join } from 'node:path'

// electron-builder 26.15.3 renames the executable, but not Electron 45's WER helper.
export async function renameElectronWer(context) {
  if (context.electronPlatformName !== 'win32') return
  const { packager, appOutDir } = context
  if (Number(packager.config.electronVersion.split('.')[0]) < 45) return
  const projectName = packager.config.electronBranding?.projectName ?? 'electron'
  const executableName = packager.appInfo.productFilename
  if (projectName === executableName) return
  await rename(
    join(appOutDir, `${projectName}_wer.dll`),
    join(appOutDir, `${executableName}_wer.dll`),
  )
}
