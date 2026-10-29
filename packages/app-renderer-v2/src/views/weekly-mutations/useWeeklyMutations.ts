import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { apiMutatorCatalog, apiWeeklyMutation } from '../../apis/weekly-mutations'
import type {
  MutationRegion,
  MutationLanguage,
  MutatorCatalog,
  WeeklyMutation,
} from '../../apis/weekly-mutations'
import { useContentCenterStore } from '../../stores/content-center'
import { localMutatorCatalog, localWeeklyMutation } from './local-data'

export function useWeeklyMutations(onFailure: () => void) {
  const services = useContentCenterStore()
  const calibrationEnabled = computed(
    () =>
      services.initialized &&
      services.officialServicesEnabled &&
      services.weeklyMutationCalibrationEnabled,
  )
  const region = ref<MutationRegion>('CN')
  const language = ref<MutationLanguage>('zhCN')
  let weeklyGeneration = 0
  let catalogGeneration = 0
  const weekly = ref<WeeklyMutation | null>(localWeeklyMutation())
  const catalog = ref<MutatorCatalog | null>(localMutatorCatalog())
  let localEndsAt = weekly.value?.available ? Date.parse(weekly.value.endsAt) : Infinity
  const weeklyLoading = ref(false)
  const catalogLoading = ref(false)
  const weeklyError = ref(false)
  const catalogError = ref(false)
  const expired = ref(false)
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const current = computed(() => (weekly.value?.available && !expired.value ? weekly.value : null))
  function checkExpiry() {
    if (disposed || !weekly.value?.available) return
    clearTimeout(timer)
    const remaining = Math.min(Date.parse(weekly.value.endsAt), localEndsAt) - Date.now()
    if (remaining <= 0) {
      void loadWeekly()
      return
    }
    timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647))
  }
  async function loadWeekly() {
    if (disposed) return
    const generation = ++weeklyGeneration
    const selectedRegion = region.value
    const selectedLanguage = language.value
    weeklyLoading.value = false
    weeklyError.value = false
    clearTimeout(timer)
    expired.value = false
    try {
      weekly.value = localWeeklyMutation(Date.now(), undefined, selectedRegion, selectedLanguage)
      localEndsAt = weekly.value.available ? Date.parse(weekly.value.endsAt) : Infinity
      checkExpiry()
    } catch {
      weekly.value = null
      weeklyError.value = true
      onFailure()
    }
    if (!calibrationEnabled.value) return
    weeklyLoading.value = true
    try {
      const result = await apiWeeklyMutation(selectedRegion, selectedLanguage)
      if (
        !disposed &&
        generation === weeklyGeneration &&
        calibrationEnabled.value &&
        result.available &&
        Date.parse(result.startsAt) <= Date.now() &&
        Date.now() < Date.parse(result.endsAt)
      ) {
        weekly.value = result
        weeklyError.value = false
        checkExpiry()
      }
    } catch {
      // Calibration is optional; the bundled schedule remains usable offline.
    } finally {
      if (!disposed && generation === weeklyGeneration) weeklyLoading.value = false
    }
  }
  async function loadCatalog() {
    if (disposed) return
    const generation = ++catalogGeneration
    const selectedLanguage = language.value
    catalogLoading.value = false
    catalogError.value = false
    catalog.value = localMutatorCatalog(selectedLanguage)
    if (!calibrationEnabled.value) return
    catalogLoading.value = true
    try {
      const result = await apiMutatorCatalog(selectedLanguage)
      if (
        !disposed &&
        generation === catalogGeneration &&
        calibrationEnabled.value &&
        result.items.length
      )
        catalog.value = result
    } catch {
      // Calibration is optional; the bundled catalog remains usable offline.
    } finally {
      if (!disposed && generation === catalogGeneration) catalogLoading.value = false
    }
  }
  function onVisible() {
    if (document.visibilityState === 'visible') checkExpiry()
  }
  watch(
    region,
    () => {
      void loadWeekly()
    },
    { flush: 'sync' },
  )
  watch(
    [language, calibrationEnabled],
    () => {
      void loadWeekly()
      void loadCatalog()
    },
    { flush: 'sync' },
  )
  onMounted(() => {
    void loadWeekly()
    void loadCatalog()
    void services.initialize().catch(() => {})
    document.addEventListener('visibilitychange', onVisible)
  })
  onUnmounted(() => {
    disposed = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })
  return {
    region,
    language,
    weekly,
    catalog,
    current,
    expired,
    weeklyLoading,
    catalogLoading,
    weeklyError,
    catalogError,
    loadWeekly,
    loadCatalog,
  }
}
