import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function sevenZipFileFilters(platform) {
  const folder = { win32: 'win', linux: 'linux', darwin: 'mac' }[platform]
  if (!folder) throw new Error(`7z-bin does not support packaging platform ${platform}`)
  return [
    `!node_modules/7z-bin/bin/!(${folder}){,/**/*}`,
    `!node_modules/7z-bin/bin/${folder}/!(${platform === 'darwin' ? '${arch}|x64|arm64' : '${arch}'}){,/**/*}`,
  ]
}

export async function verifySevenZipTarget(root, platform, arch) {
  const folder = { win32: 'win', linux: 'linux', darwin: 'mac' }[platform]
  const supported = platform === 'darwin' ? ['x64', 'arm64', 'universal'] : ['x64', 'ia32', 'arm64']
  if (!folder || !supported.includes(arch)) {
    throw new Error(`Unsupported 7z-bin packaging target: ${platform}-${arch}`)
  }
  const arches = arch === 'universal' ? ['x64', 'arm64'] : [arch]
  let binary
  for (const targetArch of arches) {
    const directory = join(root, 'bin', folder, targetArch)
    binary = join(
      directory,
      platform === 'win32' ? '7z.exe' : platform === 'darwin' ? '7zz' : '7zzs',
    )
    await access(binary)
    if (platform !== 'win32' && process.platform !== 'win32') await access(binary, constants.X_OK)
    await access(join(directory, 'License.txt'))
    if (platform === 'win32') await access(join(directory, '7z.dll'))
    if (platform === 'darwin') {
      const data = await readFile(binary)
      const expectedCpu = targetArch === 'x64' ? 0x01000007 : 0x0100000c
      const supportedCpu =
        data.readUInt32BE(0) === 0xcafebabe
          ? Array.from({ length: data.readUInt32BE(4) }, (_, index) =>
              data.readUInt32BE(8 + index * 20),
            ).includes(expectedCpu)
          : data.readUInt32LE(0) === 0xfeedfacf && data.readUInt32LE(4) === expectedCpu
      if (!supportedCpu) {
        throw new Error(`The bundled macOS 7zz does not match ${targetArch}`)
      }
    }
  }
  return binary
}
