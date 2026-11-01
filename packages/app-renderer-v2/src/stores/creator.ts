import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { AccountError } from '../apis/internal/client'
import {
  apiCreatorState,
  apiCreatorRedeem,
  apiCreatorQuota,
  type CreatorState,
  type CreatorQuota,
} from '../apis/creator'
import { useAuthStore } from './auth'
import { useContentCenterStore } from './content-center'
export const useCreatorStore = defineStore('creator', () => {
  const auth = useAuthStore()
  const content = useContentCenterStore()
  const state = ref<CreatorState | null>(null)
  const loading = ref(false)
  const error = ref<unknown>(null)
  const quota = ref<CreatorQuota | null>(null)
  const quotaLoading = ref(false)
  const quotaError = ref<unknown>(null)
  let quotaGeneration = 0
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
  function resetQuota() {
    quotaGeneration++
    quota.value = null
    quotaLoading.value = false
    quotaError.value = null
  }
  async function loadQuota() {
    if (!active.value) {
      resetQuota()
      throw new AccountError('forbidden')
    }
    const version = ++quotaGeneration
    const epoch = auth.snapshot.epoch
    const sessionId = auth.snapshot.sessionId
    const current = () =>
      version === quotaGeneration &&
      epoch === auth.snapshot.epoch &&
      sessionId === auth.snapshot.sessionId &&
      active.value
    quotaLoading.value = true
    quotaError.value = null
    quota.value = null
    try {
      const value = await apiCreatorQuota(auth.httpAuth)
      if (!current()) throw new AccountError('stale')
      if (value.userId !== state.value?.userId) throw new AccountError('invalidResponse')
      quota.value = value
      return value
    } catch (value) {
      if (current()) quotaError.value = value
      throw value
    } finally {
      if (current()) quotaLoading.value = false
    }
  }
  function reset() {
    generation++
    resetQuota()
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
  watch(
    active,
    (value) => {
      if (!value) resetQuota()
    },
    { flush: 'sync' },
  )
  return {
    state,
    active,
    loading,
    error,
    quota,
    quotaLoading,
    quotaError,
    loadQuota,
    load,
    redeem,
    reset,
  }
})
