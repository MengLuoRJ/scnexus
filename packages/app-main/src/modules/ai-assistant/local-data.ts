import { app } from 'electron'
import type { ContentRecord } from '@scnexus/app-shared/types/content.type'
import { list as listCampaigns, getActive } from '../campaign'
import { list as listCustomContent } from '../customize'
import { getGameSnapshot } from '../scii-game-setting'
import { listLocalDownloadTasks } from '../workshop-runtime'

const text = (value: unknown, max = 200) => (typeof value === 'string' ? value.slice(0, max) : '')
function projectContent(record: ContentRecord) {
  return {
    id: record.localId,
    name: text(record.package.name),
    version: text(record.package.version, 80),
    author: text(record.package.author),
    campaign: record.package.campaign ?? null,
    mode: record.mode,
    fileCount: record.fileCount,
    bytes: record.bytes,
  }
}
async function requireGame() {
  const game = await getGameSnapshot()
  if (!game.paths) throw new Error('GAME_NOT_CONFIGURED')
}
export async function readAppStatus() {
  let configured = false
  let capabilities = { client: false, switcher: false, editor: false }
  try {
    const game = await getGameSnapshot()
    configured = Boolean(game.paths)
    capabilities = game.capabilities
  } catch {
    // Status remains readable even when the optional game profile is unavailable.
  }
  return { version: app.getVersion(), gameConfigured: configured, capabilities, readOnly: true }
}
export async function readCampaigns(offset: number, limit: number) {
  await requireGame()
  const records = listCampaigns().records
  return { total: records.length, items: records.slice(offset, offset + limit).map(projectContent) }
}
export async function readCampaignDetails(id: string) {
  await requireGame()
  const record = listCampaigns().records.find((item) => item.localId === id)
  if (!record) throw new Error('CONTENT_NOT_FOUND')
  const active = Object.values(getActive().active).some((item) => item?.localId === id)
  return { ...projectContent(record), active }
}
export async function readCustomContent(offset: number, limit: number) {
  await requireGame()
  const records = listCustomContent().records
  return { total: records.length, items: records.slice(offset, offset + limit).map(projectContent) }
}
async function downloadItems() {
  return (await listLocalDownloadTasks())
    .filter((task) => task.kind === 'download')
    .map((task) => ({
      id: task.taskId,
      name: text(task.name),
      status: task.status,
      transferred: task.transferred,
      size: task.size,
      source: task.source?.kind ?? null,
    }))
}
export async function readDownloads(offset: number, limit: number) {
  const records = await downloadItems()
  return { total: records.length, items: records.slice(offset, offset + limit) }
}
export async function readTaskStatus(id: string) {
  const task = (await downloadItems()).find((item) => item.id === id)
  if (!task) throw new Error('TASK_NOT_FOUND')
  return task
}
