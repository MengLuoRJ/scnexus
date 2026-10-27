import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { AccountError } from '../apis/internal/client'
import { apiCreatorState, apiCreatorRedeem, type CreatorState } from '../apis/creator'
import { useAuthStore } from './auth'
import { useContentCenterStore } from './content-center'
export const useCreatorStore = defineStore('creator', () => {
  const auth = useAuthStore()
  const content = useContentCenterStore()
  const state = ref<CreatorState | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  let generation = 0
  const active = computed(
    () =>
      content.enabled &&
      auth.signedIn &&
      state.value?.state === 'ACTIVE' &&
      [
        'workshop.projects.create',
        'workshop.projects.manage-self',
        'workshop.uploads.manage-self',
      ].every((permission) => auth.authorization?.permissions.includes(permission)),
  )
  function reset() {
    generation++
    state.value = null
    loading.value = false
    error.value = null
  }
  async function load() {
    if (!auth.signedIn || !content.enabled) {
      reset()
      return
    }
    const version = ++generation
    loading.value = true
    error.value = null
    try {
      const value = await apiCreatorState(auth.httpAuth)
      if (version === generation) state.value = value
    } catch (value) {
      if (version === generation) {
        state.value = null
        error.value = value
      }
    } finally {
      if (version === generation) loading.value = false
    }
  }
  async function redeem(code: string) {
    if (!auth.signedIn || !content.enabled) throw new AccountError('forbidden')
    const version = ++generation
    loading.value = true
    try {
      const value = await apiCreatorRedeem(auth.httpAuth, code)
      if (version !== generation) return
      state.value = value
      await auth.loadAccount()
    } finally {
      if (version === generation) loading.value = false
    }
  }
  watch(
    () => [auth.snapshot.epoch, auth.snapshot.sessionId, auth.signedIn, content.enabled],
    () => {
      reset()
      if (auth.signedIn && content.enabled) void load()
    },
  )
  return { state, active, loading, error, load, redeem, reset }
})
