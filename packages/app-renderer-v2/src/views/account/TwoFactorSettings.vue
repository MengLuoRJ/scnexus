<script lang="ts" setup>
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { renderSVG } from 'uqr'
import { useAuthStore } from '../../stores/auth'
import {
  AccountError,
  accountErrorKey,
  apiTwoFactorEnroll,
  apiTwoFactorConfirm,
  apiTwoFactorRotate,
  apiTwoFactorDisable,
  apiTwoFactorStatus,
  apiTwoFactorRegenerate,
  apiTwoFactorVerify,
} from '../../apis'
import type { TwoFactorEnrollment, TwoFactorStatus } from '../../apis'

defineOptions({ name: 'AccountTwoFactorSettings' })
const auth = useAuthStore()
const { t } = useI18n()
const toast = useToast()
const open = ref(false)
const busy = ref(false)
const confirmed = ref(false)
const action = ref<'enable' | 'rotate' | 'disable' | 'recovery' | 'verify'>('enable')
const step = ref<'proof' | 'setup'>('setup')
const factorType = ref('otp')
const proof = ref('')
const qrImage = ref('')
const enrollment = shallowRef<TwoFactorEnrollment | null>(null)
const recoveryCodes = shallowRef<string[]>([])
const code = ref('')
const codeError = ref('')
const saved = ref(false)
const expiresAt = ref(0)
const now = ref(Date.now())
const status = shallowRef<TwoFactorStatus | null>(null)
const statusLoading = ref(false)
const statusFailed = ref(false)
let statusRequest = 0
const enabled = computed(
  () => status.value?.twoFactorEnabled ?? (confirmed.value || auth.user?.twoFactorEnabled === true),
)
const verifiedUntil = ref(0)
const verifiedSeconds = computed(() =>
  Math.min(300, Math.max(0, Math.ceil((verifiedUntil.value - now.value) / 1000))),
)
const seconds = computed(() => Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)))
const title = computed(() =>
  recoveryCodes.value.length
    ? 'account.mfaRecoveryTitle'
    : action.value === 'rotate'
      ? 'account.mfaRotate'
      : action.value === 'disable'
        ? 'account.mfaDisable'
        : action.value === 'recovery'
          ? 'account.mfaRegenerate'
          : action.value === 'verify'
            ? 'account.mfaVerifySession'
            : 'account.mfaEnable',
)
const proofWarning = computed(() =>
  action.value === 'disable'
    ? 'account.mfaDisableWarning'
    : action.value === 'recovery'
      ? 'account.mfaRegenerateWarning'
      : action.value === 'verify'
        ? 'account.mfaVerifyHint'
        : 'account.mfaRotateWarning',
)
const factors = computed(() => [
  { value: 'otp', label: t('account.otp') },
  { value: 'recovery', label: t('account.recovery') },
])
let generation = 0
watch(factorType, () => {
  proof.value = ''
  codeError.value = ''
})
watch(
  () => enrollment.value?.otpauthUri,
  (uri) => {
    qrImage.value = ''
    if (!uri) return
    const current = generation
    try {
      const image = renderSVG(uri, {
        ecc: 'M',
        border: 4,
        whiteColor: '#ffffff',
        blackColor: '#000000',
      })
      if (current === generation && enrollment.value?.otpauthUri === uri)
        qrImage.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image)}`
    } catch {
      if (current === generation && enrollment.value?.otpauthUri === uri)
        toast.add({ color: 'error', title: t('account.mfaQrFailed') })
    }
  },
  { flush: 'sync' },
)
const timer = setInterval(() => {
  now.value = Date.now()
  if (enrollment.value && seconds.value === 0) {
    enrollment.value = null
    qrImage.value = ''
    code.value = ''
    codeError.value = ''
  }
}, 1000)
function clear() {
  generation++
  enrollment.value = null
  qrImage.value = ''
  proof.value = ''
  factorType.value = 'otp'
  recoveryCodes.value = []
  code.value = ''
  codeError.value = ''
  saved.value = false
  expiresAt.value = 0
  busy.value = false
}
watch(
  open,
  (value) => {
    if (!value) clear()
  },
  { flush: 'sync' },
)
watch(
  [() => auth.signedIn, () => auth.snapshot.epoch, () => auth.snapshot.sessionId],
  () => {
    open.value = false
    clear()
    confirmed.value = false
    verifiedUntil.value = 0
    statusRequest++
    status.value = null
    statusLoading.value = false
    statusFailed.value = false
    if (auth.signedIn) void loadStatus()
  },
  { immediate: true, flush: 'sync' },
)
onScopeDispose(() => {
  statusRequest++
  clearInterval(timer)
  clear()
})
async function loadStatus() {
  if (!auth.signedIn) return
  const request = ++statusRequest
  statusLoading.value = true
  try {
    const result = await apiTwoFactorStatus(auth.httpAuth)
    if (request !== statusRequest) return
    status.value = result
    now.value = Date.now()
    verifiedUntil.value =
      result.twoFactorVerified && result.twoFactorVerifiedAt
        ? Math.min(Date.parse(result.twoFactorVerifiedAt) + 300000, now.value + 300000)
        : 0
    statusFailed.value = false
  } catch {
    if (request === statusRequest) statusFailed.value = true
  } finally {
    if (request === statusRequest) statusLoading.value = false
  }
}
function invalidateStatus() {
  statusRequest++
  statusLoading.value = false
  status.value = null
  verifiedUntil.value = 0
}
async function begin() {
  if (busy.value || auth.busy || !auth.signedIn || !auth.user || enabled.value) return
  clear()
  action.value = 'enable'
  step.value = 'setup'
  open.value = true
  busy.value = true
  const current = generation
  try {
    const result = await apiTwoFactorEnroll(auth.httpAuth)
    if (current !== generation) return
    now.value = Date.now()
    expiresAt.value = now.value + result.expiresIn * 1000
    enrollment.value = result
  } catch (error) {
    if (current !== generation) return
    open.value = false
    toast.add({
      color: 'error',
      title: t('ui.error'),
      description: t(
        error instanceof AccountError && error.kind === 'forbidden'
          ? 'account.mfaRecentLogin'
          : accountErrorKey(error),
      ),
    })
  } finally {
    if (current === generation) busy.value = false
  }
}
function manage(next: 'rotate' | 'disable' | 'recovery' | 'verify') {
  if (busy.value || auth.busy || !auth.signedIn || !enabled.value) return
  clear()
  action.value = next
  step.value = 'proof'
  open.value = true
}
async function submitProof() {
  if (busy.value || auth.busy || !auth.signedIn || step.value !== 'proof') return
  if (!(factorType.value === 'otp' ? /^\d{6}$/ : /^[a-fA-F0-9]{32}$/).test(proof.value)) {
    codeError.value = t(
      factorType.value === 'otp' ? 'account.validation.proof' : 'account.mfaRecoveryInvalid',
    )
    return
  }
  const current = generation
  const value = factorType.value === 'otp' ? { code: proof.value } : { recoveryCode: proof.value }
  proof.value = ''
  codeError.value = ''
  busy.value = true
  const startedAt = Date.now()
  invalidateStatus()
  try {
    if (action.value === 'disable') {
      await apiTwoFactorDisable(auth.httpAuth, value)
      if (current !== generation) return
      open.value = false
      toast.add({ color: 'success', title: t('account.mfaDisabledSuccess') })
      try {
        await auth.logout()
      } catch {
        toast.add({ color: 'error', title: t('account.mfaLogoutFailed') })
      }
    } else if (action.value === 'verify') {
      const duration = await apiTwoFactorVerify(auth.httpAuth, value)
      if (current !== generation) return
      now.value = Date.now()
      verifiedUntil.value = startedAt + duration * 1000
      open.value = false
      toast.add({ color: 'success', title: t('account.mfaVerified') })
      void loadStatus()
    } else if (action.value === 'recovery') {
      const result = await apiTwoFactorRegenerate(auth.httpAuth, value)
      if (current !== generation) return
      recoveryCodes.value = result
      status.value = {
        twoFactorEnabled: true,
        twoFactorVerified: true,
        twoFactorVerifiedAt: new Date().toISOString(),
        recoveryCodesRemaining: result.length,
      }
      statusFailed.value = false
      now.value = Date.now()
      verifiedUntil.value = startedAt + 300000
      toast.add({ color: 'success', title: t('account.mfaRegenerated') })
    } else {
      const result = await apiTwoFactorRotate(auth.httpAuth, value)
      if (current !== generation) return
      now.value = Date.now()
      expiresAt.value = now.value + result.expiresIn * 1000
      enrollment.value = result
      step.value = 'setup'
      void loadStatus()
    }
  } catch (error) {
    if (current !== generation) return
    if (error instanceof AccountError && error.kind === 'unauthorized')
      codeError.value = t('account.mfaFactorRejected')
    else mutationError(error)
  } finally {
    if (current === generation) busy.value = false
  }
}
function restart() {
  if (action.value === 'rotate') manage('rotate')
  else void begin()
}
function mutationError(error: unknown) {
  const uncertain =
    error instanceof AccountError && ['network', 'invalidResponse'].includes(error.kind)
  toast.add({
    color: uncertain ? 'warning' : 'error',
    title: t('ui.error'),
    description: t(uncertain ? 'account.mfaResultUnknown' : accountErrorKey(error)),
  })
}
async function confirm() {
  if (
    busy.value ||
    auth.busy ||
    !auth.signedIn ||
    !enrollment.value ||
    Date.now() >= expiresAt.value
  )
    return
  if (!/^\d{6}$/.test(code.value)) {
    codeError.value = t('account.validation.proof')
    return
  }
  busy.value = true
  codeError.value = ''
  const current = generation
  const proof = code.value
  const startedAt = Date.now()
  code.value = ''
  invalidateStatus()
  try {
    const result = await apiTwoFactorConfirm(auth.httpAuth, proof)
    if (current !== generation) return
    recoveryCodes.value = result
    enrollment.value = null
    confirmed.value = true
    status.value = {
      twoFactorEnabled: true,
      twoFactorVerified: true,
      twoFactorVerifiedAt: new Date().toISOString(),
      recoveryCodesRemaining: result.length,
    }
    statusFailed.value = false
    now.value = Date.now()
    verifiedUntil.value = startedAt + 300000
    toast.add({
      color: 'success',
      title: t(action.value === 'rotate' ? 'account.mfaRotated' : 'account.mfaActivated'),
    })
    void auth.loadAccount()
  } catch (error) {
    if (current !== generation) return
    if (error instanceof AccountError && error.kind === 'unauthorized')
      codeError.value = t('account.mfaCodeRejected')
    else mutationError(error)
  } finally {
    if (current === generation) busy.value = false
  }
}
async function copy(value: string) {
  if (!value) return
  const current = generation
  try {
    await navigator.clipboard.writeText(value)
    if (current === generation) toast.add({ color: 'success', title: t('campaign.copied') })
  } catch {
    if (current === generation) toast.add({ color: 'error', title: t('account.copyFailed') })
  }
}
</script>

<template>
  <div class="space-y-2 border-t border-default pt-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h4 class="text-sm font-medium">{{ t('account.security') }}</h4>
      <UBadge v-if="auth.user" :color="enabled ? 'success' : 'neutral'" variant="subtle">
        {{ t(enabled ? 'account.mfaEnabled' : 'account.mfaDisabled') }}
      </UBadge>
    </div>
    <UButton
      v-if="!enabled"
      icon="i-tabler-shield-lock"
      color="neutral"
      variant="outline"
      :disabled="!auth.signedIn || !auth.user || auth.busy"
      :loading="busy"
      @click="begin">
      {{ t('account.mfaEnable') }}
    </UButton>
    <div v-else class="flex flex-wrap gap-2">
      <UButton
        icon="i-tabler-shield-check"
        color="neutral"
        variant="outline"
        :disabled="busy || auth.busy || !auth.signedIn"
        @click="manage('verify')">
        {{ t('account.mfaVerifySession') }}
      </UButton>
      <UButton
        icon="i-tabler-key"
        color="neutral"
        variant="outline"
        :disabled="busy || auth.busy || !auth.signedIn"
        @click="manage('recovery')">
        {{ t('account.mfaRegenerate') }}
      </UButton>
      <UButton
        icon="i-tabler-refresh"
        color="neutral"
        variant="outline"
        :disabled="busy || auth.busy || !auth.signedIn"
        @click="manage('rotate')">
        {{ t('account.mfaRotate') }}
      </UButton>
      <UButton
        icon="i-tabler-shield-off"
        color="error"
        variant="soft"
        :disabled="busy || auth.busy || !auth.signedIn"
        @click="manage('disable')">
        {{ t('account.mfaDisable') }}
      </UButton>
    </div>
    <div class="flex items-center justify-between gap-2 text-xs text-muted">
      <span v-if="statusFailed">{{ t('account.mfaStatusUnavailable') }}</span>
      <span v-else-if="status && enabled">
        {{ t('account.mfaRemaining', { count: status.recoveryCodesRemaining }) }}
      </span>
      <span v-else-if="statusLoading">{{ t('account.mfaStatusLoading') }}</span>
      <span v-else />
      <UTooltip :text="t('account.mfaRefreshStatus')">
        <UButton
          icon="i-tabler-refresh"
          size="xs"
          color="neutral"
          variant="ghost"
          :aria-label="t('account.mfaRefreshStatus')"
          :loading="statusLoading"
          :disabled="busy || !auth.signedIn || auth.busy"
          @click="loadStatus" />
      </UTooltip>
    </div>
    <UAlert
      v-if="enabled && status?.recoveryCodesRemaining === 0"
      color="warning"
      :title="t('account.mfaNoRecovery')" />
    <p v-if="enabled && verifiedSeconds > 0" class="text-xs text-muted">
      {{ t('account.mfaVerifiedRemaining', { seconds: verifiedSeconds }) }}
    </p>
    <UModal
      v-model:open="open"
      :title="t(title)"
      :dismissible="!busy && !recoveryCodes.length"
      :close="!busy && !recoveryCodes.length">
      <template #body>
        <div v-if="recoveryCodes.length" class="space-y-4">
          <UAlert color="warning" :title="t('account.mfaRecoveryWarning')" />
          <ul class="grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
            <li v-for="item in recoveryCodes" :key="item" class="break-all select-text">
              {{ item }}
            </li>
          </ul>
          <UButton
            icon="i-tabler-copy"
            color="neutral"
            variant="outline"
            @click="copy(recoveryCodes.join('\n'))">
            {{ t('account.mfaCopyRecovery') }}
          </UButton>
          <UCheckbox v-model="saved" :label="t('account.mfaRecoverySaved')" />
        </div>
        <form
          v-else-if="step === 'proof'"
          id="two-factor-proof"
          class="space-y-4"
          @submit.prevent="submitProof">
          <UAlert
            :color="action === 'disable' || action === 'recovery' ? 'warning' : 'neutral'"
            :title="t(proofWarning)" />
          <UFormField :label="t('account.factor')">
            <USelect
              v-model="factorType"
              :items="factors"
              :disabled="busy"
              :aria-label="t('account.factor')"
              class="w-full" />
          </UFormField>
          <UFormField
            :label="t(factorType === 'otp' ? 'account.mfaCurrentOtp' : 'account.recovery')"
            :error="codeError || undefined">
            <UInput
              v-model="proof"
              :disabled="busy"
              class="w-full"
              :aria-label="t(factorType === 'otp' ? 'account.mfaCurrentOtp' : 'account.recovery')"
              :type="factorType === 'otp' ? 'text' : 'password'"
              :inputmode="factorType === 'otp' ? 'numeric' : 'text'"
              :maxlength="factorType === 'otp' ? 6 : 32"
              :autocomplete="factorType === 'otp' ? 'one-time-code' : 'off'" />
          </UFormField>
        </form>
        <form
          v-else-if="enrollment"
          id="two-factor-confirm"
          class="space-y-4"
          @submit.prevent="confirm">
          <div class="grid items-center gap-3 sm:grid-cols-[192px_minmax(0,1fr)]">
            <div class="mx-auto flex size-48 items-center justify-center">
              <img
                v-if="qrImage"
                :src="qrImage"
                :alt="t('account.mfaQrAlt')"
                width="192"
                height="192"
                class="size-48" />
              <span v-else class="text-sm text-muted">{{ t('account.mfaQrFallback') }}</span>
            </div>
            <UFormField
              class="min-w-0"
              :label="t('account.mfaSecret')"
              :description="t('account.mfaSecretHint')">
              <div class="flex items-center gap-2">
                <code class="min-w-0 flex-1 break-all select-text text-sm">
                  {{ enrollment.secret }}
                </code>
                <UTooltip :text="t('account.copy')">
                  <UButton
                    icon="i-tabler-copy"
                    :aria-label="t('account.copy')"
                    color="neutral"
                    variant="ghost"
                    @click="copy(enrollment.secret)" />
                </UTooltip>
              </div>
            </UFormField>
          </div>
          <p class="text-xs text-muted">{{ t('account.expires', { seconds }) }}</p>
          <UFormField :label="t('account.otp')" :error="codeError || undefined">
            <UInput
              v-model="code"
              class="w-full"
              :disabled="busy"
              :aria-label="t('account.otp')"
              autocomplete="one-time-code"
              inputmode="numeric"
              maxlength="6" />
          </UFormField>
        </form>
        <p v-else class="text-sm text-muted">
          {{ t(busy ? 'account.mfaPreparing' : 'account.mfaExpired') }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton v-if="recoveryCodes.length" :disabled="!saved" @click="open = false">
            {{ t('account.mfaDone') }}
          </UButton>
          <template v-else>
            <UButton color="neutral" variant="outline" :disabled="busy" @click="open = false">
              {{ t('campaign.cancel') }}
            </UButton>
            <UButton
              v-if="step === 'proof'"
              type="submit"
              form="two-factor-proof"
              :color="action === 'disable' ? 'error' : 'primary'"
              :loading="busy"
              :disabled="busy">
              {{
                t(
                  action === 'disable'
                    ? 'account.mfaDisableConfirm'
                    : action === 'recovery'
                      ? 'account.mfaRegenerateConfirm'
                      : 'account.mfaVerifyCurrent',
                )
              }}
            </UButton>
            <UButton
              v-else-if="enrollment"
              type="submit"
              form="two-factor-confirm"
              :loading="busy"
              :disabled="busy || seconds === 0">
              {{ t(action === 'rotate' ? 'account.mfaRotateConfirm' : 'account.mfaConfirm') }}
            </UButton>
            <UButton v-else-if="!busy" @click="restart">{{ t('account.mfaRestart') }}</UButton>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>
