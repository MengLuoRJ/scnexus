import { afterEach, expect, test, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ContentType, Package } from '@scnexus/app-shared/types/content.type'
import { ContentService } from '../content-package'
import { gamePaths } from '../../scii-game-setting/scii-game-setting'
import { createCampaignRepository } from '../../../stores/campaign'
import { createCustomizeRepository } from '../../../stores/customize'
import { createDependencyRepository } from '../../../stores/dependency'
import { createActiveRepository } from '../../../stores/campaign-active'
import { createElectronBackend } from '../../../stores/store-electron-backend'

vi.mock('electron', () => ({ app: { isPackaged: false } }))
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
const fields = ['aiAssistedDevelopment', 'aiGeneratedArt', 'aiGeneratedVoice'] as const
type AiUsage = Pick<Package, (typeof fields)[number]>
const declarations: AiUsage[] = [
  {},
  { aiAssistedDevelopment: true, aiGeneratedArt: false },
  { aiGeneratedArt: true, aiGeneratedVoice: false },
  { aiGeneratedVoice: true, aiAssistedDevelopment: false },
]

test.each(
  (['campaign', 'customize', 'dependency'] as const).flatMap((type) =>
    declarations.map((declaration, variant) => ({ type, declaration, variant })),
  ),
)(
  '$type preserves AI declarations variant $variant through install, disk restart and scan recovery',
  async ({ type, declaration }) => {
    const root = join(process.cwd(), '.ai-usage-test-' + randomUUID())
    roots.push(root)
    const game = join(root, 'game')
    const source = join(root, 'source')
    const storage = join(root, 'stores')
    await mkdir(game, { recursive: true })
    await mkdir(join(source, 'Mods'), { recursive: true })
    await writeFile(join(source, 'Mods', 'Core.SC2Mod'), 'mod')
    if (type === 'campaign') {
      await mkdir(join(source, 'Maps', 'Campaign'), { recursive: true })
      await writeFile(join(source, 'Maps', 'Campaign', 'Mission.SC2Map'), 'map')
    }
    const pkg: Package = {
      name: 'AI declarations',
      description: '',
      version: '1',
      author: 'Author',
      type,
      ...(type === 'campaign' ? { campaign: 'WOL' as const } : {}),
      mods: [{ name: 'Core.SC2Mod', source_path: '/Mods/Core.SC2Mod' }],
      ...declaration,
    }
    await writeFile(join(source, 'package.json'), JSON.stringify(pkg))
    const paths = gamePaths(game, join(root, 'documents'))
    async function start() {
      const campaign = createCampaignRepository()
      const customize = createCustomizeRepository()
      const dependency = createDependencyRepository()
      const active = createActiveRepository()
      campaign.init(await createElectronBackend('campaign', storage))
      customize.init(await createElectronBackend('customize', storage))
      dependency.init(await createElectronBackend('dependency', storage))
      active.init(await createElectronBackend('active', storage))
      return {
        repository: ({ campaign, customize, dependency } satisfies Record<ContentType, unknown>)[
          type
        ],
        service: new ContentService(
          async () => paths,
          campaign,
          customize,
          active,
          async (run) => run(),
          dependency,
        ),
      }
    }
    function assertUsage(value: Package) {
      for (const field of fields) {
        expect(value[field]).toBe(declaration[field])
        expect(Object.hasOwn(value, field)).toBe(Object.hasOwn(declaration, field))
      }
    }
    const initial = await start()
    const analysis = await initial.service.analyzeContent({ kind: 'directory', path: source })
    assertUsage(analysis.modes.scnexus!.package)
    const record = await initial.service.install({
      analysisId: analysis.analysisId,
      mode: 'scnexus',
      decisions: [],
    })
    assertUsage(record.package)
    assertUsage(initial.repository.getSnapshot().records[0]!.package)
    assertUsage(JSON.parse(await readFile(record.descriptorPath, 'utf8')))
    assertUsage(
      JSON.parse(await readFile(join(record.managementDirectory, 'install-manifest.json'), 'utf8'))
        .package,
    )
    const restarted = await start()
    assertUsage(restarted.repository.getSnapshot().records[0]!.package)
    // Recover from installed files without either the original source or the index record.
    await rm(source, { recursive: true })
    restarted.repository.update({ ...restarted.repository.getSnapshot(), records: [] })
    const scan = await restarted.service.scan()
    expect(scan.diagnostics).toEqual([])
    const recovered = scan.records.find((entry) => entry.localId === record.localId)
    expect(recovered).toBeDefined()
    assertUsage(recovered!.package)
    assertUsage(restarted.repository.getSnapshot().records[0]!.package)
    const afterScanRestart = await start()
    assertUsage(afterScanRestart.repository.getSnapshot().records[0]!.package)
  },
)
