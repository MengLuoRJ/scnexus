import { computed, onMounted, onUnmounted, ref } from 'vue'
import { apiMutatorCatalog, apiWeeklyMutation } from '../../apis/weekly-mutations'
import type { MutatorCatalog, WeeklyMutation } from '../../apis/weekly-mutations'
import { localMutatorCatalog, localWeeklyMutation } from './local-data'

export function useWeeklyMutations(onFailure: () => void) {
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
    if (weeklyLoading.value || disposed) return
    weeklyLoading.value = true
    weeklyError.value = false
    clearTimeout(timer)
    weekly.value = null
    expired.value = false
    try {
      const result = await apiWeeklyMutation()
      if (!disposed) {
        weekly.value = result
        checkExpiry()
      }
    } catch {
      if (!disposed) {
        try {
          weekly.value = localWeeklyMutation()
          checkExpiry()
        } catch {
          weeklyError.value = true
          onFailure()
        }
      }
    } finally {
      if (!disposed) weeklyLoading.value = false
    }
  }
  async function loadCatalog() {
    if (catalogLoading.value || disposed) return
    catalogLoading.value = true
    catalogError.value = false
    try {
      const result = await apiMutatorCatalog()
      if (!disposed) catalog.value = result
    } catch {
      if (!disposed) {
        catalog.value = localMutatorCatalog()
      }
    } finally {
      if (!disposed) catalogLoading.value = false
    }
  }
  function onVisible() {
    if (document.visibilityState === 'visible') checkExpiry()
  }
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
