import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import { ipcSettingGetSnapshot } from '../ipcs/setting'
export const useContentCenterStore = defineStore('content-center', () => {
  const aiAssistantEnabled = ref(false)
  const officialServicesEnabled = ref(true)
  const weeklyMutationCalibrationEnabled = ref(true)
  const workshopEnabled = ref(true)
  const enabled = computed(() => officialServicesEnabled.value && workshopEnabled.value)
  const initialized = ref(false)
  let flight: Promise<void> | undefined
  function accept(value: SettingSnapshot) {
    aiAssistantEnabled.value = value.aiAssistantEnabled === true
    officialServicesEnabled.value = value.officialServicesEnabled !== false
    weeklyMutationCalibrationEnabled.value = value.weeklyMutationCalibrationEnabled !== false
    workshopEnabled.value = value.workshopEnabled !== false
    initialized.value = true
  }
  async function initialize() {
    if (initialized.value) return
    if (!window.scnexus) {
      initialized.value = true
      return
    }
    flight ??= (async () => {
      const result = await ipcSettingGetSnapshot()
      if (!result.ok) throw new Error('Settings unavailable')
      accept(result.data)
    })().finally(() => {
      flight = undefined
    })
    return flight
  }
  return {
    aiAssistantEnabled,
    officialServicesEnabled,
    weeklyMutationCalibrationEnabled,
    workshopEnabled,
    enabled,
    initialized,
    accept,
    initialize,
    available: computed(() => initialized.value && enabled.value),
  }
})
