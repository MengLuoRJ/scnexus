import type { FileTree } from '@scnexus/app-shared/types/content.type'
import { countRecognizedFiles } from '@scnexus/app-shared/utils/content-files'

export function countSourceRecognizedFiles(tree: FileTree): number {
  function files(node: FileTree): { target: string }[] {
    return node.kind === 'file' ? [{ target: node.path }] : (node.children ?? []).flatMap(files)
  }
  return countRecognizedFiles(files(tree))
}
