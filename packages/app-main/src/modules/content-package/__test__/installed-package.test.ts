import { expect, test } from 'vitest'
import { normalizeInstalledPackage } from '../../../utils/installed-package'

test('installed normalization only changes the two historical package spellings', () => {
  const original = {
    bank_enable: 'offcial',
    luancher: { name: 'Entry.SC2Map', description: 'original' },
    description: 'offcial luancher are author text',
    banks: [{ name: 'offcial' }],
    maps: [{ name: 'luancher.SC2Map' }],
  }
  const before = structuredClone(original)
  expect(normalizeInstalledPackage(original)).toEqual({
    bank_enable: 'official',
    launcher: original.luancher,
    description: original.description,
    banks: original.banks,
    maps: original.maps,
  })
  expect(original).toEqual(before)
  for (const bank_enable of ['official', 'custom', 'invalid']) {
    const value = { bank_enable, launcher: { name: 'Entry.SC2Map' } }
    expect(normalizeInstalledPackage(value)).toEqual(value)
  }
})

test('equal old/new installed launchers merge but any differing values fail explicitly', () => {
  expect(
    normalizeInstalledPackage({
      launcher: { name: 'Entry.SC2Map', description: 'entry' },
      luancher: { description: 'entry', name: 'Entry.SC2Map' },
    }),
  ).toEqual({ launcher: { name: 'Entry.SC2Map', description: 'entry' } })
  for (const launcher of [
    null,
    { name: 'Other.SC2Map' },
    { name: 'Entry.SC2Map', description: 'different' },
  ])
    expect(() =>
      normalizeInstalledPackage({ launcher, luancher: { name: 'Entry.SC2Map' } }),
    ).toThrow(expect.objectContaining({ name: 'ARCHIVE-METADATA-INVALID' }))
})
