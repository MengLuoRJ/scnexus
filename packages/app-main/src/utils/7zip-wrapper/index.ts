import { createCommands } from './commands'
import { SevenZipRunner } from './runner'
import type {
  SevenZipAddOptions,
  SevenZipCommandApi,
  SevenZipCommonOptions,
  SevenZipExtractOptions,
  SevenZipListOptions,
  SevenZipReadFileOptions,
  SevenZipRenamePair,
  SevenZipWrapperOptions,
} from './types'

export type {
  SevenZipAddOptions,
  SevenZipCommandApi,
  SevenZipCommonOptions,
  SevenZipCompressionLevel,
  SevenZipEntry,
  SevenZipExtractOptions,
  SevenZipListOptions,
  SevenZipListResult,
  SevenZipProgress,
  SevenZipReadFileOptions,
  SevenZipRenamePair,
  SevenZipResult,
  SevenZipTreeNode,
  SevenZipWrapperOptions,
} from './types'
export {
  createSevenZipError,
  SevenZipError,
  SevenZipPathError,
  SevenZipTimeoutError,
} from './errors'
export { SevenZipRunner, resolveBundledBinaryPath } from './runner'

export class SevenZipWrapper implements SevenZipCommandApi {
  readonly binaryPath: string
  private readonly commands: ReturnType<typeof createCommands>

  constructor(options: SevenZipWrapperOptions = {}) {
    const runner = new SevenZipRunner(options.binaryPath)
    this.binaryPath = runner.binaryPath
    this.commands = createCommands(runner)
  }

  add(archive: string, files: string | string[], options?: SevenZipAddOptions) {
    return this.commands.add(archive, files, options)
  }

  extract(archive: string, options?: SevenZipExtractOptions) {
    return this.commands.extract(archive, options)
  }

  list(archive: string, options?: SevenZipListOptions) {
    return this.commands.list(archive, options)
  }

  listTree(archive: string, options?: SevenZipListOptions) {
    return this.commands.listTree(archive, options)
  }

  test(archive: string, options?: SevenZipCommonOptions) {
    return this.commands.test(archive, options)
  }

  delete(archive: string, files: string | string[], options?: SevenZipCommonOptions) {
    return this.commands.delete(archive, files, options)
  }

  rename(
    archive: string,
    pairs: ReadonlyArray<SevenZipRenamePair>,
    options?: SevenZipCommonOptions,
  ) {
    return this.commands.rename(archive, pairs, options)
  }

  hash(files: string | string[], algorithm?: string, options?: SevenZipCommonOptions) {
    return this.commands.hash(files, algorithm, options)
  }

  extractToStream(archive: string, file: string, options?: SevenZipCommonOptions) {
    return this.commands.extractToStream(archive, file, options)
  }

  extractToBuffer(archive: string, file: string, options?: SevenZipCommonOptions) {
    return this.commands.extractToBuffer(archive, file, options)
  }

  readFile(archive: string, file: string, options?: SevenZipReadFileOptions) {
    return this.commands.readFile(archive, file, options)
  }

  readTextFile(
    archive: string,
    file: string,
    encoding?: BufferEncoding,
    options?: SevenZipReadFileOptions,
  ) {
    return this.commands.readTextFile(archive, file, encoding, options)
  }
}

export function createSevenZip(options?: SevenZipWrapperOptions) {
  return new SevenZipWrapper(options)
}

export const sevenZip = createSevenZip()

export const add = sevenZip.add.bind(sevenZip)
export const extract = sevenZip.extract.bind(sevenZip)
export const list = sevenZip.list.bind(sevenZip)
export const listTree = sevenZip.listTree.bind(sevenZip)
export const test = sevenZip.test.bind(sevenZip)
export const deleteFiles = sevenZip.delete.bind(sevenZip)
export const rename = sevenZip.rename.bind(sevenZip)
export const hash = sevenZip.hash.bind(sevenZip)
export const extractToStream = sevenZip.extractToStream.bind(sevenZip)
export const extractToBuffer = sevenZip.extractToBuffer.bind(sevenZip)
export const readFile = sevenZip.readFile.bind(sevenZip)
export const readTextFile = sevenZip.readTextFile.bind(sevenZip)

export const quick = {
  zip: (files: string | string[], output: string) =>
    add(output, files, { archiveType: 'zip', compressionLevel: 9 }),
  sevenz: (files: string | string[], output: string) =>
    add(output, files, { archiveType: '7z', compressionLevel: 9 }),
  extract: (archive: string, outputDir?: string) => extract(archive, { outputDir }),
  list: (archive: string) => list(archive),
  test: (archive: string) => test(archive),
}

export default sevenZip
