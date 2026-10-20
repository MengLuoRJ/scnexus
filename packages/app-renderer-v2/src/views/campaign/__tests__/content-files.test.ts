import { expect, test } from 'vitest'
import { countRecognizedFiles, resourcePath } from '@scnexus/app-shared/utils/content-files'
import { countSourceRecognizedFiles } from '../countSourceRecognizedFiles'
import type { FileTree } from '@scnexus/app-shared/types/content.type'

test.each([
  ['Maps\\Demo.SC2Map\\Base.SC2Data\\GameData.xml', 'Maps/Demo.SC2Map'],
  ['Mods/A.sc2mod/Inner.SC2Map/file', 'Mods/A.sc2mod'],
  ['Maps/demo.sc2map', 'Maps/demo.sc2map'],
  ['data.sc2map.txt\\other', 'data.sc2map.txt/other'],
  ['data\\plain.txt', 'data/plain.txt'],
  ['', ''],
])('resourcePath(%s) returns %s', (path, expected) => {
  expect(resourcePath(path)).toBe(expected)
})

test('recognized count groups resources, normalizes case and separators, and keeps loose files', () => {
  const files = [
    'Maps\\Demo.SC2Map\\a',
    'maps/demo.sc2map/b',
    'Mods/A.SC2Mod/a',
    'mods/a.sc2mod/b',
    'Mods/B.SC2Mod',
    'data/loose.txt',
    'DATA/LOOSE.TXT',
    'data/other.txt',
  ].map((target) => ({ target }))
  expect(countRecognizedFiles(files)).toBe(5)
  expect(files).toHaveLength(8)
  expect(countRecognizedFiles([])).toBe(0)
})

test('source count traverses physical leaves and ignores empty ordinary directories', () => {
  const leaf = (path: string): FileTree => ({
    kind: 'file',
    name: path,
    path,
    bytes: 1,
    modifiedAt: null,
  })
  const tree: FileTree = {
    kind: 'directory',
    name: 'source',
    path: '',
    bytes: 4,
    modifiedAt: null,
    children: [
      {
        kind: 'directory',
        name: 'Map.SC2Map',
        path: 'Map.SC2Map',
        bytes: 2,
        modifiedAt: null,
        children: [leaf('Map.SC2Map/a'), leaf('Map.SC2Map/b')],
      },
      leaf('Loose.SC2Mod'),
      leaf('readme.txt'),
      { kind: 'directory', name: 'empty', path: 'empty', bytes: 0, modifiedAt: null },
    ],
  }
  expect(countSourceRecognizedFiles(tree)).toBe(3)
  expect(countSourceRecognizedFiles(leaf('Packed.SC2Map'))).toBe(1)
})
