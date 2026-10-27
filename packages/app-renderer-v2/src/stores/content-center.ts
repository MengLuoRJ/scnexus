import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import { ipcSettingGetSnapshot } from '../ipcs/setting'
export const useContentCenterStore = defineStore('content-center', () => {
  const enabled = ref(true)
  const initialized = ref(false)
  let flight: Promise<void> | undefined
  function accept(value: SettingSnapshot) {
    enabled.value = value.workshopEnabled !== false
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
    enabled,
    initialized,
    accept,
    initialize,
    available: computed(() => initialized.value && enabled.value),
  }
})
