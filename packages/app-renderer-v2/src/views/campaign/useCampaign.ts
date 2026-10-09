import { computed, onScopeDispose, ref } from 'vue'
import { apiGameSettingGet } from '../../ipcs/scii-game-setting'
import * as api from '../../ipcs/campaign'
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
  SourceInput,
  ContentRecord,
  ActiveCampaign,
  PackageCampaignType,
  ConflictDecision,
  RemovalDecision,
} from '@scnexus/app-shared/types/content.type'

export function useCampaign() {
  const records = ref<ContentRecord[]>([])
  const active = ref<Partial<Record<PackageCampaignType, ActiveCampaign>>>({})
  const analysis = ref<AnalysisResult | null>(null)
  const activation = ref<ActivationPreview | null>(null)
  const removal = ref<RemovalPreview | null>(null)
  const mode = ref<InstallMode>('scnexus')
  const busy = ref(false)
  const error = ref<AppErrorDto | null>(null)
  const diagnostics = ref<{ path: string; message: string }[]>([])
  let disposed = false
  function data<T>(result: IpcResult<T>): T {
    if (!result.ok) throw result.error
    return result.data
  }
  async function execute(run: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    error.value = null
    try {
      await run()
    } catch (value) {
      error.value = isErrorDto(value) ? value : toErrorDto(normalizeError(value))
    } finally {
      busy.value = false
    }
  }
  async function refresh() {
    const game = data(await apiGameSettingGet())
    if (!game.paths) throw new AppError(ERRORS.PROFILE_NOT_READY)
    const [list, current] = await Promise.all([api.apiCampaignList(), api.apiCampaignActive()])
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
    if (id) data(await api.apiCampaignCancel(id))
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
  function analyze(input: SourceInput) {
    return execute(async () => {
      await close()
      const result = data(await api.apiCampaignAnalyze(input))
      if (disposed) {
        await api.apiCampaignCancel(result.analysisId)
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
        activation.value = data(await api.apiCampaignPrepareActivation(record.localId))
      else
        removal.value = data(
          await (action === 'deactivate'
            ? api.apiCampaignPrepareDeactivation(record.localId)
            : api.apiCampaignPrepareUninstall(record.localId)),
        )
      if (disposed) await close()
    })
  }
  function confirm(decisions: ConflictDecision[], removals: RemovalDecision[]) {
    return execute(async () => {
      if (analysis.value)
        data(
          await api.apiCampaignInstall({
            analysisId: analysis.value.analysisId,
            mode: mode.value,
            decisions,
          }),
        )
      else if (activation.value)
        data(await api.apiCampaignActivate(activation.value.activationId, decisions))
      else if (removal.value)
        data(
          await (removal.value.operation === 'deactivate'
            ? api.apiCampaignDeactivate(removal.value.removalId, removals)
            : api.apiCampaignUninstall(removal.value.removalId, removals)),
        )
      analysis.value = null
      activation.value = null
      removal.value = null
      await refresh()
    })
  }
  onScopeDispose(() => {
    disposed = true
    const id = previewId()
    if (id) void api.apiCampaignCancel(id)
  })
  return {
    records,
    active,
    analysis,
    activation,
    removal,
    mode,
    busy,
    error,
    diagnostics,
    preview,
    conflicts,
    existing,
    analyze,
    prepare,
    confirm,
    refresh: () => execute(refresh),
    close: () => execute(close),
    scan: () =>
      execute(async () => {
        diagnostics.value = data(await api.apiCampaignScan()).diagnostics
        await refresh()
      }),
  }
}
