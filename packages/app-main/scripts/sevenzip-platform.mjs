import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function sevenZipFileFilters(platform) {
  const folder = { win32: 'win', linux: 'linux', darwin: 'mac' }[platform]
  if (!folder) throw new Error(`7z-bin does not support packaging platform ${platform}`)
  return [
    `!node_modules/7z-bin/bin/!(${folder}){,/**/*}`,
    ...(platform === 'darwin'
      ? []
      : [`!node_modules/7z-bin/bin/${folder}/!(\${arch}|License.txt){,/**/*}`]),
  ]
}

export async function verifySevenZipTarget(root, platform, arch) {
  const folder = { win32: 'win', linux: 'linux', darwin: 'mac' }[platform]
  const supported = platform === 'darwin' ? ['x64', 'arm64', 'universal'] : ['x64', 'ia32', 'arm64']
  if (!folder || !supported.includes(arch)) {
    throw new Error(`Unsupported 7z-bin packaging target: ${platform}-${arch}`)
  }
  const binary =
    platform === 'darwin'
      ? join(root, 'bin', folder, '7zz')
      : join(root, 'bin', folder, arch, platform === 'win32' ? '7z.exe' : '7zzs')
  await access(binary)
  // Windows cannot validate POSIX execute bits; check again on the macOS packaging host.
  if (platform === 'darwin' && process.platform !== 'win32') {
    await access(binary, constants.X_OK)
  }
  await access(join(root, 'bin', folder, 'License.txt'))
  if (platform === 'win32') await access(join(root, 'bin', folder, arch, '7z.dll'))
  if (platform === 'darwin') {
    const data = await readFile(binary)
    if (data.readUInt32BE(0) !== 0xcafebabe || data.readUInt32BE(4) < 2) {
      throw new Error('The bundled macOS 7zz must support both x64 and arm64')
    }
    const cpus = Array.from({ length: data.readUInt32BE(4) }, (_, index) =>
      data.readUInt32BE(8 + index * 20),
    )
    if (!cpus.includes(0x01000007) || !cpus.includes(0x0100000c)) {
      throw new Error('The bundled macOS 7zz lacks x64 or arm64 support')
    }
  }
  return binary
}
