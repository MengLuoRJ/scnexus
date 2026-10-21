import { onScopeDispose, shallowRef, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { AccountError, apiUserCheckIn, apiUserExperience, apiUserNickname } from '../../apis'
import type { Experience } from '../../apis'

const clean = (error: unknown) =>
  error instanceof AccountError ? error : new AccountError('network')

export function usePersonalCenter() {
  const auth = useAuthStore()
  const experience = shallowRef<Experience | null>(null)
  const error = shallowRef<unknown | null>(null)
  const loading = shallowRef(false)
  const saving = shallowRef(false)
  const checking = shallowRef(false)
  let generation = 0
  let request = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }
  function schedule() {
    clearTimer()
    if (!experience.value) return
    const delay = Date.parse(experience.value.nextCheckInAt) - Date.now()
    if (delay > 0) timer = setTimeout(automaticLoad, Math.min(delay, 2147483647))
  }
  async function loadExperience(): Promise<void> {
    if (!auth.signedIn) return
    const current = generation
    const sequence = ++request
    loading.value = true
    try {
      const result = await apiUserExperience(auth.httpAuth)
      if (current !== generation || sequence !== request) return
      experience.value = result
      error.value = null
      schedule()
    } catch (reason) {
      if (current !== generation || sequence !== request) return
      throw clean(reason)
    } finally {
      if (current === generation && sequence === request) loading.value = false
    }
  }
  function automaticLoad() {
    const current = generation
    void loadExperience().catch((reason: unknown) => {
      if (current === generation) error.value = clean(reason)
    })
  }
  async function saveNickname(nickname: string): Promise<string> {
    if (!auth.signedIn) throw new AccountError('unauthorized')
    if (saving.value) throw new AccountError('unavailable')
    const current = generation
    const { epoch, sessionId } = auth.snapshot
    saving.value = true
    try {
      const result = await apiUserNickname(auth.httpAuth, nickname)
      if (current !== generation) throw new AccountError('stale')
      auth.updateNickname(result.nickname, epoch, sessionId)
      return result.nickname
    } catch (reason) {
      throw clean(reason)
    } finally {
      if (current === generation) saving.value = false
    }
  }
  async function checkIn(): Promise<Experience | undefined> {
    if (!auth.signedIn) throw new AccountError('unauthorized')
    if (checking.value) return
    const current = generation
    checking.value = true
    // Supersede an earlier GET so its pre-check-in state cannot overwrite the reward.
    ++request
    loading.value = false
    try {
      const result = await apiUserCheckIn(auth.httpAuth)
      if (current !== generation) return
      ++request
      loading.value = false
      experience.value = result
      error.value = null
      schedule()
      return result
    } catch (reason) {
      throw clean(reason)
    } finally {
      if (current === generation) checking.value = false
    }
  }
  watch(
    [() => auth.signedIn, () => auth.snapshot.epoch, () => auth.snapshot.sessionId],
    () => {
      generation++
      request++
      clearTimer()
      experience.value = null
      error.value = null
      loading.value = false
      saving.value = false
      checking.value = false
      if (auth.signedIn) automaticLoad()
    },
    { immediate: true, flush: 'sync' },
  )
  function onVisibility() {
    if (document.visibilityState === 'visible' && auth.signedIn && !checking.value) automaticLoad()
  }
  document.addEventListener('visibilitychange', onVisibility)
  onScopeDispose(() => {
    generation++
    clearTimer()
    document.removeEventListener('visibilitychange', onVisibility)
  })
  return { experience, error, loading, saving, checking, loadExperience, saveNickname, checkIn }
}
