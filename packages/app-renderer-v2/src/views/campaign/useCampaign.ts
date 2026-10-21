import { computed, onScopeDispose, ref } from 'vue'
import { ipcGameSettingGet } from '../../ipcs/scii-game-setting'
import * as ipc from '../../ipcs/campaign'
import {
  isErrorDto,
  normalizeError,
  toErrorDto,
  AppError,
  ERRORS,
  type AppErrorDto,
  type IpcResult,
} from '@scnexus/app-shared/errors/app.error'
import type {
  AnalysisResult,
  ActivationPreview,
  RemovalPreview,
  InstallMode,
  InstallProgress,
  SourceInput,
  ContentRecord,
  ActiveCampaign,
  PackageCampaignType,
  ConflictDecision,
  RemovalDecision,
} from '@scnexus/app-shared/types/content.type'

export type CampaignOperationRequest = {
  record: ContentRecord
  action: 'activate' | 'deactivate' | 'uninstall'
}

export function useCampaign() {
  const records = ref<ContentRecord[]>([])
  const active = ref<Partial<Record<PackageCampaignType, ActiveCampaign>>>({})
  const analysis = ref<AnalysisResult | null>(null)
  const activation = ref<ActivationPreview | null>(null)
  const removal = ref<RemovalPreview | null>(null)
  const mode = ref<InstallMode>('scnexus')
  const busy = ref(false)
  const installProgress = ref<InstallProgress | null>(null)
  let stopProgress: (() => void) | undefined
  const warnings = ref<AppErrorDto[]>([])
  const error = ref<AppErrorDto | null>(null)
  const diagnostics = ref<{ path: string; message: string }[]>([])
  let disposed = false
  function data<T>(result: IpcResult<T>): T {
    if (!result.ok) throw result.error
    if (result.warnings?.length) warnings.value = [...warnings.value, ...result.warnings]
    return result.data
  }
  async function execute<T>(run: () => Promise<T>): Promise<T | undefined> {
    if (busy.value) return
    busy.value = true
    error.value = null
    warnings.value = []
    try {
      return await run()
    } catch (value) {
      error.value = isErrorDto(value) ? value : toErrorDto(normalizeError(value))
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    const game = data(await ipcGameSettingGet())
    if (!game.paths) throw new AppError(ERRORS.PROFILE_NOT_READY)
    const [list, current] = await Promise.all([ipc.ipcCampaignList(), ipc.ipcCampaignActive()])
    records.value = data(list).records.filter((record) => record.gameRoot === game.gameRoot)
    active.value = Object.fromEntries(
      Object.entries(data(current).active).filter(
        ([, record]) => record?.gameRoot === game.gameRoot,
      ),
    )
  }
  function previewId() {
    return analysis.value?.analysisId ?? activation.value?.activationId ?? removal.value?.removalId
  }
  async function close() {
    const id = previewId()
    if (id) data(await ipc.ipcCampaignCancel(id))
    analysis.value = null
    activation.value = null
    removal.value = null
  }
  const preview = computed(() => analysis.value?.modes[mode.value] ?? null)
  const conflicts = computed(
    () =>
      activation.value?.conflicts ??
      analysis.value?.conflicts.find((group) => group.mode === mode.value)?.files ??
      [],
  )
  const existing = computed(() => analysis.value?.existingInstallations[mode.value] ?? [])
  function acceptAnalysis(result: AnalysisResult) {
    if (result.contentType !== 'campaign') return false
    analysis.value = result
    mode.value =
      result.recommendedMode ??
      (result.modes.scnexus ? 'scnexus' : result.modes.ccm ? 'ccm' : 'auto')
    return true
  }
  function analyze(input: SourceInput) {
    return execute(async () => {
      await close()
      const result = data(await ipc.ipcCampaignAnalyze(input))
      if (disposed) {
        await ipc.ipcCampaignCancel(result.analysisId)
        return
      }
      analysis.value = result
      mode.value =
        result.recommendedMode ??
        (result.modes.scnexus ? 'scnexus' : result.modes.ccm ? 'ccm' : 'auto')
    })
  }
  function prepare(record: ContentRecord, action: 'activate' | 'deactivate' | 'uninstall') {
    return execute(async () => {
      await close()
      if (action === 'activate')
        activation.value = data(await ipc.ipcCampaignPrepareActivation(record.localId))
      else
        removal.value = data(
          await (action === 'deactivate'
            ? ipc.ipcCampaignPrepareDeactivation(record.localId)
            : ipc.ipcCampaignPrepareUninstall(record.localId)),
        )
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
        stopProgress = ipc.ipcCampaignOnInstallProgress((progress) => {
          if (!disposed && progress.taskId === taskId && progress.analysisId === analysisId)
            installProgress.value = progress
        })
        try {
          installed = data(
            await ipc.ipcCampaignInstall({ analysisId, taskId, mode: mode.value, decisions }),
          )
        } finally {
          stopProgress()
          stopProgress = undefined
        }
      } else if (activation.value)
        data(await ipc.ipcCampaignActivate(activation.value.activationId, decisions))
      else if (removal.value)
        data(
          await (removal.value.operation === 'deactivate'
            ? ipc.ipcCampaignDeactivate(removal.value.removalId, removals)
            : ipc.ipcCampaignUninstall(removal.value.removalId, removals)),
        )
      else return
      analysis.value = null
      activation.value = null
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
    if (id) void ipc.ipcCampaignCancel(id)
  })
  return {
    records,
    active,
    analysis,
    activation,
    removal,
    mode,
    busy,
    installProgress,
    error,
    warnings,
    diagnostics,
    preview,
    conflicts,
    existing,
    analyze,
    acceptAnalysis,
    prepare,
    confirm,
    refresh: () => execute(refresh),
    close: () => execute(close),
    scan: () =>
      execute(async () => {
        diagnostics.value = data(await ipc.ipcCampaignScan()).diagnostics
        await refresh()
      }),
  }
}
