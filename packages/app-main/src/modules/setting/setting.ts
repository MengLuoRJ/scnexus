import { app, dialog, type IpcMainInvokeEvent } from 'electron'
import { assertIpcSource } from '../../utils/ipc-source'
import { isTrustedRendererUrl } from '../window/origin'
import { gt, valid } from 'semver'
import { isAbsolute, join } from 'node:path'
import { stat, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { AppError, ERRORS } from '@scnexus/app-shared/errors/app.error'
import type { SettingData } from '@scnexus/app-shared/stores/setting.store'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import { getSettingStore, updateSettingStore } from '../../stores/setting'
import { applyLogLevel, reportError } from '../logging/logging'
import { disableTelemetry, enableTelemetry, setSavedTelemetryEnabled } from '../telemetry/telemetry'
import { getMainWindow, onWindowReady } from '../window/window'
import { setWorkshopEnabled } from '../workshop-lifecycle'
import { setOfficialServicesEnabled } from '../auth'
import { setAnalyticsEnabled } from '../analytics-lifecycle'
import { setAiAssistantEnabled } from '../ai-assistant'
import { setUpdaterChannel } from '../updater/updater'
import { resolveDisplayLanguage, validatePreferencePatch } from './setting-validation'

let pending: Promise<unknown> = Promise.resolve()
let stopReady: (() => void) | undefined
export function getSettingSnapshot(): SettingSnapshot {
  const data = getSettingStore()
  return {
    ...data,
    effectiveStarCraftDocumentsDirectory:
      data.starCraftDocumentsDirectory || join(app.getPath('documents'), 'StarCraft II'),
    effectiveLanguage: resolveDisplayLanguage(
      data.displayLanguage,
      app.getPreferredSystemLanguages(),
    ),
  }
}
export function getSettingKey(key: unknown) {
  const data = getSettingStore()
  if (typeof key !== 'string' || !Object.hasOwn(data, key))
    throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return data[key as keyof SettingData]
}
function publish() {
  getMainWindow()?.webContents.send('setting:changed', getSettingSnapshot())
}

const AUTO_APPROVAL_LABELS = {
  aiAutoApproveSwitchCampaign: '切换当前自定义战役',
  aiAutoApproveRestoreCampaign: '恢复原版战役',
  aiAutoApproveUninstallCampaign: '卸载本地战役',
} as const
async function confirmAutoApproval(
  patch: Record<string, unknown>,
  previous: SettingData,
  source?: IpcMainInvokeEvent,
) {
  const enabling = (
    Object.keys(AUTO_APPROVAL_LABELS) as (keyof typeof AUTO_APPROVAL_LABELS)[]
  ).filter((key) => patch[key] === true && previous[key] !== true)
  if (!enabling.length) return
  if (!source) throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  assertIpcSource(source)
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
    throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
  let invalidated = false
  const invalidate = () => {
    invalidated = true
  }
  window.webContents.on('did-start-navigation', invalidate)
  window.on('closed', invalidate)
  try {
    const result = await dialog.showMessageBox(window, {
      type: 'warning',
      title: '星际枢纽：自动批准风险确认',
      message: '允许 AI 自动执行以下战役操作？',
      detail:
        enabling.map((key) => AUTO_APPROVAL_LABELS[key]).join('、') +
        '\n此授权将保存在本机。AI 可在无人值守时执行这些操作，不再逐次确认；可能停用当前战役或删除本地文件及本地更改。仅在理解风险时启用，可随时在客户端关闭。',
      buttons: ['取消', '启用自动批准'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (invalidated || window !== getMainWindow()) throw new AppError(ERRORS.IPC_SOURCE_REJECTED)
    assertIpcSource(source)
    if (result.response !== 1) throw new AppError(ERRORS.TASK_CANCELLED)
  } finally {
    window.webContents.off('did-start-navigation', invalidate)
    window.off('closed', invalidate)
  }
}
async function applyUpdate(
  raw: unknown,
  complete: boolean,
  source?: IpcMainInvokeEvent,
): Promise<SettingSnapshot> {
  const patch = validatePreferencePatch(raw, complete)
  if ('downloadDirectory' in patch) {
    const directory = patch.downloadDirectory as string
    try {
      if (!isAbsolute(directory) || !(await stat(directory)).isDirectory())
        throw new Error('Not a directory')
      await access(directory, constants.W_OK)
    } catch (cause) {
      throw new AppError(
        ERRORS.SETTING_INVALID_VALUE,
        { message: 'Download directory must be writable' },
        { cause },
      )
    }
  }
  if (patch.starCraftDocumentsDirectory) {
    try {
      if (!(await stat(patch.starCraftDocumentsDirectory as string)).isDirectory())
        throw new Error('Not a directory')
    } catch (cause) {
      throw new AppError(
        ERRORS.SETTING_INVALID_VALUE,
        { message: 'StarCraft II documents path must be a directory' },
        { cause },
      )
    }
  }
  const previous = getSettingStore()
  await confirmAutoApproval(patch, previous, source)
  const next = { ...previous, ...patch } as SettingData
  if ('updateChannel' in patch) setUpdaterChannel(next.updateChannel)
  let disableError: unknown
  if (next.telemetryEnabled === false && 'telemetryEnabled' in patch) {
    try {
      await disableTelemetry(previous.telemetryEnabled)
    } catch (error) {
      disableError = error
    }
  }
  let saved: SettingData
  try {
    saved = updateSettingStore(next)
  } catch (error) {
    if ('updateChannel' in patch) setUpdaterChannel(previous.updateChannel)
    throw error
  }
  setSavedTelemetryEnabled(saved.telemetryEnabled)
  if (next.logLevel !== previous.logLevel) {
    try {
      applyLogLevel(next.logLevel)
    } catch (cause) {
      applyLogLevel(previous.logLevel)
      if ('updateChannel' in patch) setUpdaterChannel(previous.updateChannel)
      updateSettingStore({
        ...previous,
        ...(next.telemetryEnabled === false ? { telemetryEnabled: false } : {}),
      })
      publish()
      throw new AppError(ERRORS.LOGGING_CONFIGURATION_FAILED, {}, { cause })
    }
  }
  let aiAssistantError: unknown
  if ('aiAssistantEnabled' in patch) {
    try {
      await setAiAssistantEnabled(saved.aiAssistantEnabled)
    } catch (error) {
      aiAssistantError = error
    }
  }
  let officialServicesError: unknown
  if (saved.officialServicesEnabled !== previous.officialServicesEnabled) {
    try {
      setOfficialServicesEnabled(saved.officialServicesEnabled)
    } catch (error) {
      officialServicesError = error
    }
  }
  if ('officialServicesEnabled' in patch || 'workshopEnabled' in patch)
    setWorkshopEnabled(saved.officialServicesEnabled && saved.workshopEnabled)
  if ('officialServicesEnabled' in patch || 'analyticsEnabled' in patch)
    setAnalyticsEnabled(saved.analyticsEnabled)
  if (saved.telemetryEnabled && 'telemetryEnabled' in patch) {
    try {
      enableTelemetry(saved.clientId)
    } catch (error) {
      publish()
      throw error
    }
  }
  publish()
  if (aiAssistantError) throw aiAssistantError
  if (officialServicesError) throw officialServicesError
  if (disableError) throw disableError
  return getSettingSnapshot()
}
export function updateSetting(
  raw: unknown,
  complete = false,
  source?: IpcMainInvokeEvent,
): Promise<SettingSnapshot> {
  const result = pending.then(() => applyUpdate(raw, complete, source))
  pending = result.catch(() => {})
  return result
}
export function updateSettingKey(key: unknown, value: unknown, source?: IpcMainInvokeEvent) {
  if (typeof key !== 'string') throw new AppError(ERRORS.IPC_INVALID_ARGUMENT)
  return updateSetting({ [key]: value }, false, source)
}
export function initializeSetting() {
  const data = getSettingStore()
  applyLogLevel(data.logLevel)
  setWorkshopEnabled(data.officialServicesEnabled && data.workshopEnabled)
  setAnalyticsEnabled(data.analyticsEnabled)
  if (data.telemetryEnabled) {
    try {
      enableTelemetry(data.clientId)
    } catch (error) {
      reportError(error, 'telemetry')
    }
  }
  if (app.isPackaged) {
    const current = app.getVersion()
    if (valid(current) && current !== data._lastConfirmedVersion) {
      updateSettingStore({
        ...data,
        _lastConfirmedVersion: current,
        lastUpdatedAt:
          data._lastConfirmedVersion &&
          valid(data._lastConfirmedVersion) &&
          gt(current, data._lastConfirmedVersion)
            ? Date.now()
            : data.lastUpdatedAt,
      })
    }
  }
  stopReady?.()
  stopReady = onWindowReady(publish)
}
export function disposeSetting() {
  stopReady?.()
  stopReady = undefined
}
