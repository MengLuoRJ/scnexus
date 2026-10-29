import { beforeEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  game: vi.fn<() => Promise<unknown>>(),
  campaigns: vi.fn<() => unknown>(),
  custom: vi.fn<() => unknown>(),
  downloads: vi.fn<() => Promise<unknown[]>>(),
}))
vi.mock('electron', () => ({ app: { getVersion: () => 'test-version' } }))
vi.mock('../../campaign', () => ({
  list: mocks.campaigns,
  getActive: () => ({ active: { WOL: { localId: 'local-id' } } }),
}))
vi.mock('../../customize', () => ({ list: mocks.custom }))
vi.mock('../../scii-game-setting', () => ({ getGameSnapshot: mocks.game }))
vi.mock('../../workshop-runtime', () => ({ listLocalDownloadTasks: mocks.downloads }))
import {
  readAppStatus,
  readCampaigns,
  readCampaignDetails,
  readCustomContent,
  readDownloads,
  readTaskStatus,
} from '../local-data'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.game.mockResolvedValue({
    paths: {},
    capabilities: { client: true, switcher: false, editor: false },
  })
  const record = {
    localId: 'local-id',
    package: { name: 'Campaign', version: '1', author: 'Author', campaign: 'WOL' },
    mode: 'scnexus',
    bytes: 2,
    fileCount: 1,
    gameRoot: 'PRIVATE_PATH',
    descriptorPath: 'PRIVATE_PATH',
    source: { path: 'PRIVATE_PATH' },
  }
  mocks.campaigns.mockReturnValue({ records: [record] })
  mocks.custom.mockReturnValue({ records: [record] })
  mocks.downloads.mockResolvedValue([
    {
      taskId: 'download',
      kind: 'download',
      name: 'Package',
      status: 'completed',
      transferred: 2,
      size: 2,
      sessionId: 'PRIVATE_SESSION',
      fileId: 'PRIVATE_FILE',
      source: { kind: 'github', repository: 'PRIVATE_URL' },
    },
    { taskId: 'upload', kind: 'upload' },
  ])
})
test('read models project only bounded metadata without filesystem paths or credentials', async () => {
  const results = await Promise.all([
    readCampaigns(0, 1),
    readCampaignDetails('local-id'),
    readCustomContent(0, 1),
    readDownloads(0, 1),
    readTaskStatus('download'),
  ])
  expect(JSON.stringify(results)).not.toContain('PRIVATE_')
  expect(results[1]).toMatchObject({ id: 'local-id', active: true })
  expect(results[3]).toMatchObject({ total: 1 })
  expect(await readCampaigns(1, 1)).toEqual({ total: 1, items: [] })
  await expect(readTaskStatus('upload')).rejects.toThrow('TASK_NOT_FOUND')
  await expect(readCampaignDetails('unknown')).rejects.toThrow('CONTENT_NOT_FOUND')
})
test('unconfigured game does not prevent app status or download queries', async () => {
  mocks.game.mockResolvedValue({
    paths: null,
    capabilities: { client: false, switcher: false, editor: false },
  })
  expect(await readAppStatus()).toMatchObject({ gameConfigured: false, readOnly: true })
  await expect(readCampaigns(0, 10)).rejects.toThrow('GAME_NOT_CONFIGURED')
  expect(await readDownloads(0, 10)).toMatchObject({ total: 1 })
})
