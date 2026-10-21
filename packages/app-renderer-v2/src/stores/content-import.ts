import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { isErrorDto, normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  AnalysisResult,
  SourceInput,
  ContentType,
} from '@scnexus/app-shared/types/content.type'
import { ipcContentAnalyze } from '../ipcs/content'
import { ipcCampaignCancel } from '../ipcs/campaign'

type DescriptorChoice = 'package-json' | 'metadata-txt'

export const useContentImportStore = defineStore('content-import', () => {
  const busy = ref(false)
  const source = shallowRef<SourceInput | null>(null)
  const conflict = shallowRef<AppErrorDto | null>(null)
  const error = shallowRef<AppErrorDto | null>(null)
  const warnings = shallowRef<AppErrorDto[]>([])
  const pending = shallowRef<AnalysisResult | null>(null)
  let generation = 0
  async function analyze(
    input: SourceInput,
    choice?: DescriptorChoice,
  ): Promise<ContentType | undefined> {
    if (busy.value || pending.value) return
    busy.value = true
    error.value = null
    warnings.value = []
    conflict.value = null
    source.value = input
    const current = ++generation
    try {
      const result = await ipcContentAnalyze(input, choice)
      if (current !== generation) {
        if (result.ok) await ipcCampaignCancel(result.data.analysisId)
        return
      }
      if (!result.ok) {
        if (result.error.code === 'M064') conflict.value = result.error
        else error.value = result.error
        return
      }
      warnings.value = result.warnings ?? []
      pending.value = result.data
      source.value = null
      return result.data.contentType
    } catch (value) {
      error.value = isErrorDto(value) ? value : toErrorDto(normalizeError(value))
    } finally {
      if (current === generation) busy.value = false
    }
  }
  function take(type: ContentType): AnalysisResult | null {
    if (pending.value?.contentType !== type) return null
    const result = pending.value
    pending.value = null
    return result
  }
  async function cancel() {
    generation++
    busy.value = false
    const id = pending.value?.analysisId
    pending.value = null
    conflict.value = null
    source.value = null
    if (id) {
      try {
        const result = await ipcCampaignCancel(id)
        if (!result.ok) error.value = result.error
      } catch (value) {
        error.value = toErrorDto(normalizeError(value))
      }
    }
  }
  return { busy, source, conflict, error, warnings, pending, analyze, take, cancel }
})
