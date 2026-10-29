import { ref, onScopeDispose } from 'vue'
import { defineStore } from 'pinia'
import type {
  AiAssistantStatus,
  AiOperationRecord,
} from '@scnexus/app-shared/types/ai-assistant.type'
import {
  ipcAiAssistantGetStatus,
  ipcAiAssistantListRecords,
  ipcAiAssistantOnStatusChanged,
  ipcAiAssistantOnRecordChanged,
  ipcAiAssistantClearRecords,
} from '../ipcs'

export const useAiAssistantStore = defineStore('ai-assistant', () => {
  const status = ref<AiAssistantStatus>({ state: 'stopped', port: 17861 })
  const records = ref<AiOperationRecord[]>([])
  function acceptRecord(value: AiOperationRecord) {
    const record: AiOperationRecord = {
      id: value.id,
      toolName: value.toolName,
      status: value.status,
      startedAt: value.startedAt,
      finishedAt: value.finishedAt,
      errorCode: value.errorCode,
    }
    const index = records.value.findIndex((item) => item.id === record.id)
    if (index >= 0) records.value[index] = record
    else records.value.push(record)
    records.value = records.value.slice(-500)
  }
  let disconnect: (() => void) | undefined
  let statusRevision = 0
  let historyRevision = 0
  let subscriptionRevision = 0
  let recordRevision = 0
  const recordVersions = new Map<string, number>()
  function subscribe() {
    disconnect?.()
    const offStatus = ipcAiAssistantOnStatusChanged((value) => {
      statusRevision++
      status.value = value
    })
    const offRecord = ipcAiAssistantOnRecordChanged((value) => {
      recordVersions.set(value.id, ++recordRevision)
      if (recordVersions.size > 500) recordVersions.delete(recordVersions.keys().next().value!)
      acceptRecord(value)
    })
    const dispose = () => {
      subscriptionRevision++
      offStatus()
      offRecord()
      if (disconnect === dispose) disconnect = undefined
    }
    disconnect = dispose
    return dispose
  }
  onScopeDispose(() => disconnect?.())
  async function refresh() {
    const currentStatusRevision = statusRevision
    const currentHistoryRevision = historyRevision
    const currentSubscriptionRevision = subscriptionRevision
    const currentRecordRevision = recordRevision
    const [current, history] = await Promise.all([
      ipcAiAssistantGetStatus(),
      ipcAiAssistantListRecords(),
    ])
    if (!current.ok) return current
    if (!history.ok) return history
    if (currentSubscriptionRevision !== subscriptionRevision)
      return { ok: true as const, data: undefined }
    if (currentStatusRevision === statusRevision) status.value = current.data
    if (currentHistoryRevision === historyRevision) {
      const newer = records.value.filter(
        (record) => (recordVersions.get(record.id) ?? 0) > currentRecordRevision,
      )
      records.value = []
      for (const record of history.data) acceptRecord(record)
      for (const record of newer) acceptRecord(record)
    }
    return { ok: true as const, data: undefined }
  }
  async function clearRecords() {
    const result = await ipcAiAssistantClearRecords()
    if (result.ok) {
      historyRevision++
      recordVersions.clear()
      records.value = []
    }
    return result
  }
  return { status, records, subscribe, refresh, clearRecords }
})
