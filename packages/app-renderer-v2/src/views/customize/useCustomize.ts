import { computed, onScopeDispose, ref } from 'vue'
import * as api from '../../ipcs/customize'
import { apiGameSettingGet } from '../../ipcs/scii-game-setting'
import {
  AppError,
  ERRORS,
  isErrorDto,
  normalizeError,
  toErrorDto,
} from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto, IpcResult } from '@scnexus/app-shared/errors/app.error'
import type {
  AnalysisResult,
  ContentRecord,
  InstallMode,
  InstallProgress,
  RemovalPreview,
  SourceInput,
  ConflictDecision,
  RemovalDecision,
} from '@scnexus/app-shared/types/content.type'

export function useCustomize() {
  const records = ref<ContentRecord[]>([])
  const analysis = ref<AnalysisResult | null>(null)
  const removal = ref<RemovalPreview | null>(null)
  const mode = ref<InstallMode>('scnexus')
  const busy = ref(false)
  const error = ref<AppErrorDto | null>(null)
  const diagnostics = ref<{ path: string; message: string }[]>([])
  const installProgress = ref<InstallProgress | null>(null)
  let disposed = false
  let stopProgress: (() => void) | undefined
  function data<T>(result: IpcResult<T>): T {
    if (!result.ok) throw result.error
    return result.data
  }
  async function execute<T>(run: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      return await run()
    } catch (value) {
      error.value = isErrorDto(value) ? value : toErrorDto(normalizeError(value))
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    const game = data(await apiGameSettingGet())
    if (!game.paths) throw new AppError(ERRORS.PROFILE_NOT_READY)
    records.value = data(await api.apiCustomizeList()).records.filter(
      (record) => record.gameRoot === game.gameRoot,
    )
  }
  function previewId() {
    return analysis.value?.analysisId ?? removal.value?.removalId
  }
  async function close() {
    const id = previewId()
    if (id) data(await api.apiCustomizeCancel(id))
    analysis.value = null
    removal.value = null
  }
  const preview = computed(() => analysis.value?.modes[mode.value] ?? null)
  const conflicts = computed(
    () => analysis.value?.conflicts.find((group) => group.mode === mode.value)?.files ?? [],
  )
  const existing = computed(() => analysis.value?.existingInstallations[mode.value] ?? [])
  function analyze(input: SourceInput) {
    return execute(async () => {
      await close()
      const result = data(await api.apiCustomizeAnalyze(input))
      if (disposed) {
        await api.apiCustomizeCancel(result.analysisId)
        return
      }
      analysis.value = result
      mode.value = result.modes.scnexus ? 'scnexus' : 'auto'
    })
  }
  function prepare(record: ContentRecord) {
    return execute(async () => {
      await close()
      removal.value = data(await api.apiCustomizePrepareUninstall(record.localId))
      if (disposed) await close()
    })
  }
  function confirm(decisions: ConflictDecision[], removals: RemovalDecision[]) {
    return execute(async () => {
      let installed: ContentRecord | null = null
      if (analysis.value) {
        const analysisId = analysis.value.analysisId
        const taskId = crypto.randomUUID()
        installProgress.value = null
        stopProgress = api.apiCustomizeOnInstallProgress((progress) => {
          if (!disposed && progress.taskId === taskId && progress.analysisId === analysisId)
            installProgress.value = progress
        })
        try {
          installed = data(
            await api.apiCustomizeInstall({ analysisId, taskId, mode: mode.value, decisions }),
          )
        } finally {
          stopProgress()
          stopProgress = undefined
        }
      } else if (removal.value)
        data(await api.apiCustomizeUninstall(removal.value.removalId, removals))
      else return
      analysis.value = null
      removal.value = null
      try {
        await refresh()
      } catch (value) {
        error.value = isErrorDto(value) ? value : toErrorDto(normalizeError(value))
      }
      return { installed }
    })
  }
  onScopeDispose(() => {
    disposed = true
    stopProgress?.()
    const id = previewId()
    if (id) void api.apiCustomizeCancel(id)
  })
  return {
    records,
    analysis,
    removal,
    mode,
    busy,
    error,
    diagnostics,
    installProgress,
    preview,
    conflicts,
    existing,
    analyze,
    prepare,
    confirm,
    close: () => execute(close),
    refresh: () => execute(refresh),
    scan: () =>
      execute(async () => {
        diagnostics.value = data(await api.apiCustomizeScan()).diagnostics
        await refresh()
      }),
  }
}
