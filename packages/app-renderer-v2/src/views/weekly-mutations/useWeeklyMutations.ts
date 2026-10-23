import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { apiMutatorCatalog, apiWeeklyMutation } from '../../apis/weekly-mutations'
import type {
  MutationRegion,
  MutationLanguage,
  MutatorCatalog,
  WeeklyMutation,
} from '../../apis/weekly-mutations'
import { localMutatorCatalog, localWeeklyMutation } from './local-data'

export function useWeeklyMutations(onFailure: () => void) {
  const region = ref<MutationRegion>('CN')
  const language = ref<MutationLanguage>('zhCN')
  let weeklyGeneration = 0
  let catalogGeneration = 0
  const weekly = ref<WeeklyMutation | null>(null)
  const catalog = ref<MutatorCatalog | null>(null)
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
    const remaining = Date.parse(weekly.value.endsAt) - Date.now()
    expired.value = remaining <= 0
    if (!expired.value) timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647))
  }
  async function loadWeekly() {
    if (disposed) return
    const generation = ++weeklyGeneration
    const selectedRegion = region.value
    const selectedLanguage = language.value
    weeklyLoading.value = true
    weeklyError.value = false
    clearTimeout(timer)
    weekly.value = null
    expired.value = false
    try {
      const result = await apiWeeklyMutation(selectedRegion, selectedLanguage)
      if (!disposed && generation === weeklyGeneration) {
        weekly.value = result
        checkExpiry()
      }
    } catch {
      if (!disposed && generation === weeklyGeneration) {
        try {
          weekly.value = localWeeklyMutation(
            Date.now(),
            undefined,
            selectedRegion,
            selectedLanguage,
          )
          checkExpiry()
        } catch {
          weeklyError.value = true
          onFailure()
        }
      }
    } finally {
      if (!disposed && generation === weeklyGeneration) weeklyLoading.value = false
    }
  }
  async function loadCatalog() {
    if (disposed) return
    const generation = ++catalogGeneration
    const selectedLanguage = language.value
    catalogLoading.value = true
    catalogError.value = false
    try {
      const result = await apiMutatorCatalog(selectedLanguage)
      if (!disposed && generation === catalogGeneration) catalog.value = result
    } catch {
      if (!disposed && generation === catalogGeneration) {
        catalog.value = localMutatorCatalog(selectedLanguage)
      }
    } finally {
      if (!disposed && generation === catalogGeneration) catalogLoading.value = false
    }
  }
  function onVisible() {
    if (document.visibilityState === 'visible') checkExpiry()
  }
  watch(region, () => {
    void loadWeekly()
  })
  watch(language, () => {
    void loadWeekly()
    void loadCatalog()
  })
  onMounted(() => {
    void loadWeekly()
    void loadCatalog()
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
