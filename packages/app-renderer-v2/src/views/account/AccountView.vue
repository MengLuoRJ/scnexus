<script lang="ts" setup>
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { ipcAppGetDeviceName } from '../../ipcs/app'
import CreatorStatus from './CreatorStatus.vue'
import logo from '../../assets/logo.png'
import { apiRegistrationPolicy, accountErrorKey } from '../../apis'
import { usePersonalCenter } from './usePersonalCenter'
import {
  nicknameSchema,
  challengeState,
  validSubject,
  validFactor,
  validateAccount,
  type AccountMode,
  type ChallengeState,
} from './form'
defineOptions({ name: 'AccountView' })
const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
watch(
  () => auth.signedIn,
  (signedIn) => {
    const target = route.query.redirect
    if (
      signedIn &&
      typeof target === 'string' &&
      /^\/(workshop(?:\/\d+)?|downloads|creator|uploads)$/.test(target)
    )
      void router.replace(target)
  },
)
const center = usePersonalCenter()
const { experience, loading: experienceLoading, saving, checking, error: experienceError } = center
const editingNickname = ref(false)
const showingUserId = ref(false)
const nicknameForm = reactive({ nickname: '' })
const nicknameError = ref('')
function openUserId() {
  if (!auth.user?.id) return
  showingUserId.value = true
}
async function copyUserId() {
  if (!auth.user?.id) return
  try {
    await navigator.clipboard.writeText(auth.user.id)
    toast.add({ color: 'success', title: t('campaign.copied') })
  } catch {
    toast.add({ color: 'error', title: t('account.copyFailed') })
  }
}
function editNickname() {
  nicknameForm.nickname = auth.user?.nickname ?? ''
  nicknameError.value = ''
  editingNickname.value = true
}
async function saveNickname() {
  if (saving.value || !auth.signedIn) return
  const result = nicknameSchema.safeParse(nicknameForm.nickname)
  if (!result.success) {
    nicknameError.value = t('account.nicknameInvalid')
    return
  }
  nicknameError.value = ''
  try {
    await center.saveNickname(result.data)
    editingNickname.value = false
    success('account.nicknameSaved')
  } catch (error) {
    notify(error)
  }
}
async function checkIn() {
  if (checking.value || !auth.signedIn || experience.value?.checkedIn) return
  try {
    const result = await center.checkIn()
    if (result)
      toast.add({
        color: 'success',
        title: t(result.awardedExperience > 0 ? 'account.checkInDone' : 'account.alreadyCheckedIn'),
        description: t('account.experienceAward', { amount: result.awardedExperience }),
      })
  } catch (error) {
    notify(error)
  }
}
watch(experienceError, (error) => {
  if (error) notify(error)
})
watch(
  () => auth.snapshot.epoch,
  () => {
    editingNickname.value = false
    nicknameForm.nickname = ''
    nicknameError.value = ''
  },
)
const available = Boolean(window.scnexus)
const mode = ref<AccountMode>('login')
const fields = reactive({
  subject: '',
  password: '',
  deviceName: '',
  proof: '',
  invitationCode: '',
})
const factorType = ref('otp')
const factor = ref('')
const challenge = shallowRef<ChallengeState | null>(null)
const retryAt = ref(0)
const invitationRequired = ref(false)
const policyReady = ref(false)
const challengeBusy = ref(false)
const submitting = ref(false)
const now = ref(Date.now())
const timer = setInterval(() => {
  now.value = Date.now()
}, 1000)
onUnmounted(() => clearInterval(timer))
const retrySeconds = computed(() => Math.max(0, Math.ceil((retryAt.value - now.value) / 1000)))
const expiresSeconds = computed(() =>
  Math.max(0, Math.ceil(((challenge.value?.expiresAt ?? 0) - now.value) / 1000)),
)
const mfaSeconds = computed(() =>
  Math.max(0, Math.ceil(((auth.snapshot.mfaExpiresAt ?? 0) - now.value) / 1000)),
)
const locked = computed(() => !available || auth.busy || submitting.value || challengeBusy.value)
const modes = computed(() =>
  ['login', 'register', 'reset'].map((value) => ({ value, label: t(`account.${value}`) })),
)
const factors = computed(() => [
  { value: 'otp', label: t('account.otp') },
  { value: 'recovery', label: t('account.recovery') },
])
function notify(error: unknown) {
  toast.add({ color: 'error', title: t('ui.error'), description: t(accountErrorKey(error)) })
}
function success(key: string) {
  toast.add({ color: 'success', title: t(key) })
}
watch(
  () => auth.profileError,
  (value) => {
    if (value) notify(value)
  },
  { immediate: true },
)
watch(
  [mode, () => fields.subject],
  () => {
    challenge.value = null
    fields.proof = ''
    fields.password = ''
    factor.value = ''
  },
  { flush: 'sync' },
)
watch(factorType, () => {
  factor.value = ''
})
watch(
  () => auth.snapshot.epoch,
  () => {
    fields.password = ''
    fields.proof = ''
    factor.value = ''
    challenge.value = null
  },
)
async function loadPolicy() {
  policyReady.value = false
  try {
    invitationRequired.value = (await apiRegistrationPolicy()).invitationRequired
    policyReady.value = true
  } catch (error) {
    toast.add({
      color: 'error',
      title: t('account.policyUnavailable'),
      description: t(accountErrorKey(error)),
    })
  }
}
onMounted(loadPolicy)
onMounted(async () => {
  if (!available) return
  const result = await ipcAppGetDeviceName()
  if (result.ok && !fields.deviceName) fields.deviceName = result.data
})
function validate() {
  return validateAccount(
    fields,
    mode.value,
    invitationRequired.value,
    challenge.value,
    Date.now(),
  ).map((error) => ({ ...error, message: t(error.message) }))
}
async function requestChallenge() {
  if (locked.value || retrySeconds.value || !validSubject(fields.subject)) return
  challengeBusy.value = true
  const subject = fields.subject
  const epoch = auth.snapshot.epoch
  const purpose = mode.value === 'register' ? 'REGISTER' : 'RESET'
  challenge.value = null
  fields.proof = ''
  try {
    const next = challengeState(
      await auth.requestChallenge({ subject, purpose }),
      subject,
      purpose,
      Date.now(),
    )
    retryAt.value = next.retryAt
    if (
      auth.snapshot.epoch === epoch &&
      fields.subject === subject &&
      (mode.value === 'register' ? 'REGISTER' : 'RESET') === purpose &&
      mode.value !== 'login'
    )
      challenge.value = next
    success('account.challengeAccepted')
  } catch (error) {
    notify(error)
  } finally {
    challengeBusy.value = false
  }
}
async function submit() {
  if (locked.value || validate().length || (mode.value === 'register' && !policyReady.value)) return
  submitting.value = true
  try {
    if (mode.value === 'login')
      await auth.login({
        subject: fields.subject,
        password: fields.password,
        deviceName: fields.deviceName,
      })
    else if (mode.value === 'register' && challenge.value)
      await auth.register({
        subject: fields.subject,
        password: fields.password,
        deviceName: fields.deviceName,
        challengeId: challenge.value.challengeId,
        proof: fields.proof,
        ...(fields.invitationCode !== '' ? { invitationCode: fields.invitationCode } : {}),
      })
    else if (challenge.value) {
      await auth.resetPassword({
        challengeId: challenge.value.challengeId,
        proof: fields.proof,
        password: fields.password,
      })
      success('account.resetDone')
      mode.value = 'login'
    }
    if (auth.signedIn) success('account.signedIn')
  } catch (error) {
    notify(error)
  } finally {
    fields.password = ''
    fields.proof = ''
    submitting.value = false
  }
}
async function submitFactor() {
  if (locked.value || !mfaSeconds.value || !validFactor(factorType.value, factor.value)) return
  submitting.value = true
  try {
    await auth.completeMfa(
      factorType.value === 'otp' ? { code: factor.value } : { recoveryCode: factor.value },
    )
    if (auth.signedIn) success('account.signedIn')
  } catch (error) {
    notify(error)
  } finally {
    factor.value = ''
    submitting.value = false
  }
}
async function logout() {
  if (locked.value) return
  fields.password = ''
  fields.proof = ''
  factor.value = ''
  challenge.value = null
  try {
    const result = await auth.logout()
    if (result?.remoteRevoked) success('account.signedOut')
    else
      toast.add({
        color: 'warning',
        title: t('account.localLogout'),
        description: t('account.remoteLogoutFailed'),
      })
  } catch (error) {
    notify(error)
  }
}
</script>
<template>
  <section v-if="auth.signedIn" class="w-full space-y-3 p-3" :aria-label="t('account.dashboard')">
    <div class="relative overflow-hidden rounded-xl border border-default bg-elevated/50 p-4">
      <div
        aria-hidden="true"
        class="pointer-events-none absolute -right-12 -top-20 size-72 rounded-full bg-primary/10 blur-3xl"
      />
      <div class="relative flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <UAvatar icon="i-tabler-user" size="xl" class="shrink-0 ring-4 ring-default" />
          <div class="min-w-0 space-y-1">
            <p class="text-xs font-medium uppercase tracking-widest text-primary">
              SCNEXUS ACCOUNT
            </p>
            <h2 class="text-xl font-semibold tracking-tight">
              {{ auth.user?.nickname || t('account.dashboard') }}
            </h2>
          </div>
        </div>
        <UBadge color="success" variant="subtle" size="lg">{{ t('account.signedIn') }}</UBadge>
      </div>
    </div>
    <CreatorStatus />
    <div class="grid grid-cols-2 items-start gap-3">
      <UCard
        class="min-w-0"
        :ui="{
          header: 'px-4 py-3 sm:px-4 sm:py-3',
          body: 'p-4 sm:p-4',
          footer: 'px-4 py-3 sm:px-4 sm:py-3',
        }"
      >
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold">{{ t('account.profile') }}</h3>
            <UButton
              icon="i-tabler-id-badge-2"
              color="neutral"
              variant="ghost"
              size="sm"
              :disabled="!auth.user?.id"
              @click="openUserId"
              >{{ t('account.viewId') }}</UButton
            >
          </div>
        </template>
        <div class="space-y-4">
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm text-muted">{{ t('account.nickname') }}</p>
              <UButton
                v-if="!editingNickname"
                icon="i-tabler-pencil"
                color="neutral"
                variant="ghost"
                size="sm"
                :disabled="locked || !auth.user"
                @click="editNickname"
                >{{ t('account.editNickname') }}</UButton
              >
            </div>
            <UForm
              v-if="editingNickname"
              :state="nicknameForm"
              class="space-y-2"
              @submit="saveNickname"
            >
              <UFormField
                name="nickname"
                :error="nicknameError || undefined"
                :description="t('account.nicknameHint')"
              >
                <UInput
                  v-model="nicknameForm.nickname"
                  class="w-full"
                  :disabled="saving"
                  :aria-label="t('account.nickname')"
                  autocomplete="off"
                />
              </UFormField>
              <div class="flex gap-2">
                <UButton type="submit" :loading="saving" :disabled="locked">{{
                  t('ui.save')
                }}</UButton
                ><UButton
                  color="neutral"
                  variant="ghost"
                  :disabled="saving"
                  @click="editingNickname = false"
                  >{{ t('campaign.cancel') }}</UButton
                >
              </div>
            </UForm>
            <p v-else class="break-words font-medium">
              {{ auth.user?.nickname ?? t('account.loading') }}
            </p>
          </div>
          <div class="space-y-2">
            <p class="text-sm text-muted">{{ t('account.email') }}</p>
            <p class="break-all font-medium">
              {{
                auth.user?.email ?? (auth.user ? t('account.emailUnbound') : t('account.loading'))
              }}
            </p>
          </div>
        </div>
        <template #footer>
          <div class="flex flex-wrap justify-between gap-2">
            <UButton
              icon="i-tabler-logout"
              :disabled="locked || saving || checking"
              color="error"
              variant="soft"
              @click="logout"
              >{{ t('account.logout') }}</UButton
            >
          </div>
        </template>
      </UCard>
      <UCard
        class="min-w-0"
        :ui="{
          header: 'px-4 py-3 sm:px-4 sm:py-3',
          body: 'p-4 sm:p-4',
          footer: 'px-4 py-3 sm:px-4 sm:py-3',
        }"
      >
        <template #header
          ><h3 class="font-semibold">{{ t('account.growth') }}</h3></template
        >
        <div v-if="experience" class="space-y-3">
          <div class="flex items-end justify-between gap-3">
            <span class="text-3xl font-semibold text-primary">LV{{ experience.level }}</span
            ><span class="text-sm text-muted">{{
              t('account.experienceTotal', { amount: experience.experience })
            }}</span>
          </div>
          <div class="space-y-2">
            <UProgress
              :model-value="experience.nextLevelExperience === null ? 100 : experience.experience"
              :max="experience.nextLevelExperience ?? 100"
              :aria-label="t('account.growth')"
            />
            <p class="text-xs text-muted">
              {{
                experience.nextLevelExperience === null
                  ? t('account.maxLevel')
                  : t('account.toNextLevel', { amount: experience.experienceToNextLevel })
              }}
            </p>
          </div>
          <div class="space-y-2 border-t border-default pt-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h4 class="text-sm font-medium">{{ t('account.dailyCheckIn') }}</h4>
              <UBadge v-if="experience.checkedIn" color="success" variant="subtle">{{
                t('account.alreadyCheckedIn')
              }}</UBadge>
            </div>
            <p class="text-xs text-muted">{{ t('account.checkInHint') }}</p>
            <UButton
              block
              icon="i-tabler-calendar-check"
              :loading="checking"
              :disabled="locked || checking || experienceLoading || experience.checkedIn"
              @click="checkIn"
              >{{
                t(experience.checkedIn ? 'account.alreadyCheckedIn' : 'account.checkIn')
              }}</UButton
            >
          </div>
        </div>
        <div v-else class="space-y-3">
          <p class="text-sm text-muted">
            {{ t(experienceLoading ? 'account.loading' : 'account.experienceUnavailable') }}
          </p>
        </div>
      </UCard>
    </div>
    <UModal v-model:open="showingUserId" :title="t('account.userId')">
      <template #body>
        <p class="break-all font-mono text-sm font-medium">
          {{ auth.user?.id ?? t('account.loading') }}
        </p>
      </template>
      <template #footer>
        <UButton
          icon="i-tabler-copy"
          color="neutral"
          variant="outline"
          :disabled="!auth.user?.id"
          @click="copyUserId"
          >{{ t('account.copy') }}</UButton
        >
      </template>
    </UModal>
  </section>
  <section v-else class="flex flex-1">
    <div class="grid min-h-full w-full bg-default grid-cols-[0.85fr_1.15fr]">
      <aside
        class="relative flex flex-col justify-between overflow-hidden border-r border-default bg-elevated/50 p-8"
      >
        <div
          aria-hidden="true"
          class="absolute -left-16 top-20 size-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div class="relative flex items-center gap-3">
          <img :src="logo" alt="" class="size-10 object-contain" /><span
            class="font-semibold tracking-wide"
            >SCNEXUS</span
          >
        </div>
        <div class="relative space-y-4 py-6">
          <h2 class="text-3xl font-semibold leading-tight tracking-tight">
            {{ t('account.welcome') }}
          </h2>
          <p class="text-sm leading-relaxed text-muted">{{ t('account.welcomeHint') }}</p>
        </div>
        <div class="relative flex items-start gap-2 text-xs leading-relaxed text-muted">
          <UIcon name="i-tabler-shield-lock" class="mt-0.5 size-4 shrink-0" />{{
            t('account.localFirst')
          }}
        </div>
      </aside>
      <div class="min-w-0 space-y-4 p-5 sm:p-6">
        <div class="space-y-2">
          <UAvatar icon="i-tabler-user" size="lg" class="mb-3" />
          <h2 class="text-2xl font-semibold tracking-tight">
            {{
              t(
                auth.snapshot.status === 'mfa-pending'
                  ? 'account.verifyIdentity'
                  : mode === 'login'
                    ? 'account.welcomeBack'
                    : mode === 'register'
                      ? 'account.createAccount'
                      : 'account.reset',
              )
            }}
          </h2>
          <p class="text-sm text-muted">{{ t('account.formHint') }}</p>
        </div>
        <UAlert
          v-if="!available"
          color="neutral"
          variant="subtle"
          :title="t('account.desktopRequired')"
        />
        <template v-if="auth.snapshot.status === 'mfa-pending'">
          <UAlert
            :title="t('account.mfaRequired')"
            :description="t('account.expires', { seconds: mfaSeconds })"
          />
          <UFormField :label="t('account.factor')"
            ><USelect v-model="factorType" :items="factors" :disabled="locked"
          /></UFormField>
          <UForm :state="{ factor }" class="space-y-4" @submit="submitFactor">
            <UFormField
              :label="t(factorType === 'otp' ? 'account.otp' : 'account.recovery')"
              name="factor"
            >
              <UInput
                class="w-full"
                size="lg"
                v-model="factor"
                :maxlength="factorType === 'otp' ? 6 : 128"
                :type="factorType === 'otp' ? 'text' : 'password'"
                autocomplete="one-time-code"
                :disabled="locked"
              />
            </UFormField>
            <UButton type="submit" :disabled="locked || !mfaSeconds" :loading="submitting">{{
              t('account.verify')
            }}</UButton>
            <UButton class="ml-2" variant="outline" :disabled="locked" @click="logout">{{
              t('account.cancel')
            }}</UButton>
          </UForm>
        </template>
        <template v-else>
          <UTabs v-model="mode" :items="modes" :content="false" :disabled="locked" class="w-full" />
          <UForm :state="fields" :validate="validate" class="space-y-4" @submit="submit">
            <UFormField :label="t('account.subject')" name="subject" required
              ><UInput
                class="w-full"
                size="lg"
                v-model="fields.subject"
                type="email"
                :maxlength="254"
                autocomplete="username"
                :disabled="locked"
            /></UFormField>
            <UFormField
              :label="t('account.password')"
              :description="
                t(mode === 'login' ? 'account.loginPasswordHint' : 'account.newPasswordHint')
              "
              name="password"
              required
              ><UInput
                class="w-full"
                size="lg"
                v-model="fields.password"
                type="password"
                :maxlength="128"
                :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
                :disabled="locked"
            /></UFormField>
            <UFormField
              v-if="mode !== 'reset'"
              :label="t('account.deviceName')"
              name="deviceName"
              required
              ><UInput
                class="w-full"
                size="lg"
                v-model="fields.deviceName"
                :maxlength="80"
                :disabled="locked"
            /></UFormField>
            <template v-if="mode !== 'login'">
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <UFormField :label="t('account.proof')" name="proof" required>
                  <UInput
                    class="w-full"
                    size="lg"
                    v-model="fields.proof"
                    type="text"
                    inputmode="numeric"
                    :maxlength="6"
                    autocomplete="one-time-code"
                    :disabled="locked"
                  />
                </UFormField>
                <UFormField name="challenge" :label="t('account.challenge')">
                  <UButton
                    size="lg"
                    color="neutral"
                    :disabled="locked || retrySeconds > 0 || !validSubject(fields.subject)"
                    :loading="challengeBusy"
                    variant="outline"
                    @click="requestChallenge"
                    >{{
                      retrySeconds
                        ? t('account.retry', { seconds: retrySeconds })
                        : t('account.sendCode')
                    }}</UButton
                  >
                </UFormField>
              </div>
              <p v-if="challenge" class="text-xs text-muted">
                {{ t('account.expires', { seconds: expiresSeconds }) }}
              </p>
            </template>
            <template v-if="mode === 'register'">
              <UFormField
                :label="t('account.invitationCode')"
                name="invitationCode"
                :required="invitationRequired"
                ><UInput
                  class="w-full"
                  size="lg"
                  v-model="fields.invitationCode"
                  :maxlength="64"
                  :disabled="locked"
                  autocomplete="off"
              /></UFormField>
            </template>
            <UButton
              block
              size="lg"
              class="mt-4"
              type="submit"
              :disabled="locked || (mode === 'register' && !policyReady)"
              :loading="submitting"
              >{{ t(`account.${mode}`) }}</UButton
            >
          </UForm>
        </template>
      </div>
    </div>
  </section>
</template>
