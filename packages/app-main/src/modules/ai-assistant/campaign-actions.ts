import { dialog } from 'electron'
import type {
  ContentRecord,
  InstalledFile,
  RemovalPreview,
} from '@scnexus/app-shared/types/content.type'
import * as campaign from '../campaign'
import { getGameSnapshot } from '../scii-game-setting'
import { getMainWindow } from '../window/window'
import { isTrustedRendererUrl } from '../window/origin'
import { safeGamePath, walkReadOnly, keyPath } from '../content-package/paths'
import { resourceGroups, resourceState } from '../content-package/resources'
import { relative } from 'node:path'
import { hashFile } from '../content-package/source'

type Operation = 'activate' | 'switch' | 'restore' | 'uninstall'
type BeginMutation = () => void
export type CampaignActionResult = {
  id: string
  operation: Operation
  restoredId?: string
  status: 'completed' | 'unchanged' | 'requires-review' | 'cancelled' | 'partially-completed'
  errorCode?: 'ACTION_REQUIRES_REVIEW' | 'CANCELLED'
  message?: string
}
const review = (id: string, operation: Operation): CampaignActionResult => ({
  id,
  operation,
  status: 'requires-review',
  errorCode: 'ACTION_REQUIRES_REVIEW',
  message: '请在客户端战役管理界面检查文件冲突及当前状态后操作。',
})
function check(signal: AbortSignal) {
  if (signal.aborted) throw new Error('CANCELLED')
}
function find(id: string): ContentRecord {
  if (
    typeof id !== 'string' ||
    !id ||
    id.length > 200 ||
    /[\\/]/.test(id) ||
    [...id].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error('CONTENT_NOT_FOUND')
  const record = campaign.list().records.find((item) => item.localId === id)
  if (!record || record.package.type !== 'campaign') throw new Error('CONTENT_NOT_FOUND')
  return record
}
function current(record: ContentRecord) {
  return campaign.getActive().active[record.package.campaign!]
}
function state() {
  return JSON.stringify([campaign.list(), campaign.getActive()])
}
function trustedWindow() {
  const window = getMainWindow()
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    !isTrustedRendererUrl(
      window.webContents.getURL(),
      import.meta.env.DEV ? import.meta.env.VITE_DEV_SERVER_URL : undefined,
    )
  )
    return null
  return window
}
function plainName(name: string) {
  return [...name]
    .map((character) => {
      const code = character.charCodeAt(0)
      return code < 32 ||
        (code >= 127 && code <= 159) ||
        (code >= 0x202a && code <= 0x202e) ||
        (code >= 0x2066 && code <= 0x2069)
        ? ' '
        : character
    })
    .join('')
    .slice(0, 120)
}
async function confirm(
  record: ContentRecord,
  operation: 'restore' | 'uninstall',
  files: number,
  signal: AbortSignal,
  switchTarget?: ContentRecord,
) {
  check(signal)
  const window = trustedWindow()
  if (!window) return false
  let invalidated = false
  const invalidate = () => {
    invalidated = true
  }
  window.webContents.on('did-start-navigation', invalidate)
  window.on('closed', invalidate)
  let result: Awaited<ReturnType<typeof dialog.showMessageBox>>
  try {
    result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '星际枢纽：确认 AI 战役操作',
      message: switchTarget
        ? '允许切换自定义战役？'
        : operation === 'restore'
          ? '允许恢复原版战役？'
          : '允许卸载本地战役？',
      detail: switchTarget
        ? `当前战役：${plainName(record.package.name)}\n目标战役：${plainName(switchTarget.package.name)}\n目标 ID：${plainName(switchTarget.localId)}\n操作步骤：停用当前战役 → 激活目标战役\n停用文件数：${files}\n警告：两个步骤分别提交；若目标激活失败，当前战役将保持停用，请在客户端继续。`
        : `战役：${plainName(record.package.name)}\n操作文件数：${files}\n警告：此操作会${operation === 'restore' ? '停用当前自定义战役并恢复原版' : '删除本地安装的战役及其整个本地库目录（包括目录内的本地更改）'}。请仅在确认此请求符合您的意图时允许。`,
      buttons: ['取消', '允许操作'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      normalizeAccessKeys: false,
    })
  } finally {
    window.webContents.off('did-start-navigation', invalidate)
    window.off('closed', invalidate)
  }
  check(signal)
  return !invalidated && trustedWindow() === window && result.response === 1
}

// Removal previews detect drift since preparation, not pre-existing user edits.
// Verify tracked resources first; unknown ownership must be reviewed in the client.
async function unchangedResources(files: InstalledFile[]) {
  const game = await getGameSnapshot()
  if (!game.paths) throw new Error('GAME_NOT_CONFIGURED')
  for (const group of resourceGroups(files).filter((item) =>
    item.files.every((file) => file.result !== 'kept'),
  )) {
    const expected = new Map(group.files.map((file) => [keyPath(file.target), file.hash]))
    const root = await safeGamePath(game.paths, group.target)
    const seen = new Set<string>()
    await walkReadOnly(root, async (absolute, path, info) => {
      if (!info.isFile()) return
      const target = keyPath(path ? group.target + '/' + path : group.target)
      if (!expected.has(target) || (await hashFile(absolute)) !== expected.get(target))
        throw new Error('ACTION_REQUIRES_REVIEW')
      seen.add(target)
    })
    if (seen.size !== expected.size) throw new Error('ACTION_REQUIRES_REVIEW')
  }
}
async function safeRemoval(
  record: ContentRecord,
  operation: 'restore' | 'uninstall',
  preview: RemovalPreview,
) {
  if (
    preview.localId !== record.localId ||
    preview.operation !== (operation === 'restore' ? 'deactivate' : 'uninstall') ||
    preview.files.length
  )
    return false
  const active = current(record)
  if (operation === 'restore') {
    if (active?.localId !== record.localId || active.ownershipUnknown) return false
    await unchangedResources(
      active.installedFiles.filter((file) => record.mode !== 'ccm' || file.type === 'map'),
    )
    // The active marker is removed by the service alongside the tracked resources.
    if ((await hashFile(active.descriptorPath)) !== (await hashFile(record.descriptorPath)))
      return false
  } else {
    if (active?.localId === record.localId) return false
    await unchangedResources(record.installedFiles)
  }
  return true
}
async function remove(
  id: string,
  operation: 'restore' | 'uninstall',
  signal: AbortSignal,
  beginMutation: BeginMutation,
  switchTarget?: ContentRecord,
): Promise<CampaignActionResult> {
  check(signal)
  const record = find(id)
  if (operation === 'restore' && current(record)?.localId !== id) return review(id, operation)
  const before = state()
  const preview =
    operation === 'restore'
      ? await campaign.prepareDeactivation(id)
      : await campaign.prepareUninstall(id)
  if (!(await safeRemoval(record, operation, preview))) return review(id, operation)
  const game = await getGameSnapshot()
  if (!game.paths) throw new Error('GAME_NOT_CONFIGURED')
  const libraryPath =
    operation === 'uninstall' && !record.external
      ? await safeGamePath(game.paths, relative(game.paths.gameRoot, record.managementDirectory))
      : null
  const library = libraryPath ? await resourceState(libraryPath) : null
  if (libraryPath && !library) return review(id, operation)
  check(signal)
  const files = operation === 'restore' ? current(record)!.installedFiles.length : record.fileCount
  const approvalWindow = trustedWindow()
  if (!(await confirm(record, operation, files, signal, switchTarget)))
    return { id, operation, status: 'cancelled', errorCode: 'CANCELLED' }
  check(signal)
  if (state() !== before || !(await safeRemoval(find(id), operation, preview)))
    return review(id, operation)
  if (libraryPath && (await resourceState(libraryPath))?.hash !== library?.hash)
    return review(id, operation)
  check(signal)
  if (state() !== before || !approvalWindow || trustedWindow() !== approvalWindow)
    return review(id, operation)
  beginMutation()
  if (operation === 'restore') await campaign.deactivate(preview.removalId, [])
  else await campaign.uninstall(preview.removalId, [])
  return { id, operation, status: 'completed' }
}
async function activate(
  id: string,
  operation: 'activate' | 'switch',
  signal: AbortSignal,
  beginMutation: BeginMutation,
): Promise<CampaignActionResult> {
  check(signal)
  const record = find(id)
  const active = current(record)
  if (active?.localId === id) return { id, operation, status: 'unchanged' }
  if (active) {
    if (operation !== 'switch') return review(id, operation)
    const restored = await remove(active.localId, 'restore', signal, beginMutation, record)
    if (restored.status !== 'completed') return { ...restored, id, operation }
    const partial: CampaignActionResult = {
      ...review(id, operation),
      status: 'partially-completed',
      restoredId: active.localId,
      message: '原战役已停用；目标战役尚未激活，请在客户端继续。',
    }
    try {
      const result = await activate(id, 'activate', signal, () => {})
      return result.status === 'completed'
        ? { ...result, operation, restoredId: active.localId }
        : partial
    } catch {
      return partial
    }
  }
  const before = state()
  const preview = await campaign.prepareActivation(id)
  check(signal)
  if (preview.localId !== id || preview.conflicts.length || state() !== before)
    return review(id, operation)
  find(id)
  check(signal)
  beginMutation()
  await campaign.activate(preview.activationId, [])
  return { id, operation, status: 'completed' }
}
async function safely(
  id: string,
  operation: Operation,
  run: () => Promise<CampaignActionResult>,
): Promise<CampaignActionResult> {
  try {
    return await run()
  } catch (error) {
    if (
      error instanceof Error &&
      ['CANCELLED', 'CONTENT_NOT_FOUND', 'GAME_NOT_CONFIGURED'].includes(error.message)
    )
      throw error
    return review(id, operation)
  }
}
export const activateCampaign = (
  id: string,
  signal: AbortSignal,
  beginMutation: BeginMutation = () => {},
) => safely(id, 'activate', () => activate(id, 'activate', signal, beginMutation))
export const switchCampaign = (
  id: string,
  signal: AbortSignal,
  beginMutation: BeginMutation = () => {},
) => safely(id, 'switch', () => activate(id, 'switch', signal, beginMutation))
export const restoreCampaign = (
  id: string,
  signal: AbortSignal,
  beginMutation: BeginMutation = () => {},
) => safely(id, 'restore', () => remove(id, 'restore', signal, beginMutation))
export const uninstallCampaign = (
  id: string,
  signal: AbortSignal,
  beginMutation: BeginMutation = () => {},
) => safely(id, 'uninstall', () => remove(id, 'uninstall', signal, beginMutation))
