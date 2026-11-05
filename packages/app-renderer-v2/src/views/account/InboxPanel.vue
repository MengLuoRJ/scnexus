<script lang="ts" setup>
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { useContentCenterStore } from '../../stores/content-center'
import {
  apiInboxList,
  apiInboxUnreadCount,
  apiInboxRead,
  apiInboxReadAll,
  type InboxNotification,
} from '../../apis/inbox'
import { AccountError, accountErrorKey } from '../../apis/internal/client'
import { useInboxRealtime } from '../../composables/useInboxRealtime'
import { ipcShellOpenExternalWebsite } from '../../ipcs/shell'
import { ipcUnwrap } from '../../ipcs/internal/ipc-common'
import InboxBody from './InboxBody.vue'
import { inboxNavigation } from './inbox-link'
defineOptions({ name: 'AccountInboxPanel' })
const auth = useAuthStore()
const center = useContentCenterStore()
const router = useRouter()
const { t, d } = useI18n()
const toast = useToast()
const filter = shallowRef<'all' | 'read' | 'unread'>('all')
const page = shallowRef(1)
const list = shallowRef<Awaited<ReturnType<typeof apiInboxList>> | null>(null)
const unread = shallowRef<number | null>(null)
const loading = shallowRef(false)
const error = shallowRef<unknown>(null)
const busy = shallowRef(false)
const selected = shallowRef<InboxNotification | null>(null)
const external = shallowRef<string | null>(null)
const allowed = computed(() => auth.signedIn && center.officialServicesEnabled)
const filters = computed(() =>
  ['all', 'unread', 'read'].map((value) => ({ value, label: t(`inbox.${value}`) })),
)
const navigation = computed(() => (selected.value ? inboxNavigation(selected.value) : null))
let generation = 0
let request = 0
onScopeDispose(() => {
  generation++
  request++
})
function fail(value: unknown) {
  if (value instanceof AccountError && value.kind === 'stale') return
  toast.add({ color: 'error', title: t(accountErrorKey(value)) })
}
function formatDate(value: string) {
  return d(new Date(value), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
async function load(target = page.value) {
  if (!allowed.value) return
  const identity = generation
  const current = ++request
  const currentFilter = filter.value
  const active = () => identity === generation && current === request && allowed.value
  loading.value = true
  error.value = null
  try {
    let result = await apiInboxList(auth.httpAuth, currentFilter, target)
    if (active() && !result.items.length && target > 1) {
      target = 1
      result = await apiInboxList(auth.httpAuth, currentFilter, target)
    }
    if (!active()) return
    const count = await apiInboxUnreadCount(auth.httpAuth)
    if (!active()) return
    list.value = result
    page.value = target
    unread.value = count
    if (selected.value) {
      const updated = result.items.find((item) => item.id === selected.value?.id)
      if (updated) selected.value = updated
    }
  } catch (value) {
    if (active()) error.value = value
  } finally {
    if (active()) loading.value = false
  }
}
watch(
  () => [allowed.value, auth.snapshot.epoch, auth.snapshot.sessionId],
  () => {
    generation++
    request++
    list.value = null
    unread.value = null
    selected.value = null
    external.value = null
    error.value = null
    busy.value = false
    loading.value = false
    filter.value = 'all'
    page.value = 1
    if (allowed.value) void load(1)
  },
  { immediate: true, flush: 'sync' },
)
watch(filter, () => {
  if (allowed.value) void load(1)
})
const { status } = useInboxRealtime(() => {
  if (allowed.value) void load()
})
async function mark(message: InboxNotification | null) {
  if (busy.value || !allowed.value || (message && message.readAt !== null)) return
  const current = generation
  busy.value = true
  try {
    if (message) await apiInboxRead(auth.httpAuth, message.id)
    else await apiInboxReadAll(auth.httpAuth)
    if (current !== generation) return
    selected.value = null
    external.value = null
    toast.add({ color: 'success', title: t('inbox.marked') })
    await load()
  } catch (value) {
    if (current === generation) fail(value)
  } finally {
    if (current === generation) busy.value = false
  }
}
function open(message: InboxNotification) {
  selected.value = message
}
async function navigate() {
  const target = navigation.value
  if (!target || !allowed.value) return
  if (target.kind === 'external') external.value = target.target
  else {
    selected.value = null
    await router.push(target.target)
  }
}
async function confirmExternal() {
  const url = external.value
  external.value = null
  if (!url || !allowed.value) return
  try {
    await ipcUnwrap(ipcShellOpenExternalWebsite(url))
  } catch (value) {
    fail(value)
  }
}
</script>
<template>
  <UCard v-if="allowed" class="min-w-0" :ui="{ body: 'p-4 sm:p-4' }">
    <div class="flex items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-2 min-w-0">
        <h3 class="font-semibold">{{ t('inbox.title') }}</h3>
        <UBadge v-if="unread !== null" color="neutral" variant="subtle">
          {{ t('inbox.unreadCount', { count: unread }) }}
        </UBadge>
      </div>
      <div class="flex gap-2 shrink-0">
        <UButton size="sm" variant="outline" :loading="loading" @click="load()">
          {{ t('inbox.refresh') }}
        </UButton>
        <UButton
          size="sm"
          :loading="busy"
          :disabled="loading || unread === null || unread === 0"
          @click="mark(null)">
          {{ t('inbox.readAll') }}
        </UButton>
      </div>
    </div>
    <UAlert
      v-if="status === 'unavailable'"
      color="warning"
      :title="t('inbox.realtimeUnavailable')"
      class="mb-3" />
    <UAlert
      v-if="error"
      color="error"
      :title="t('inbox.loadFailed')"
      :description="t(accountErrorKey(error))"
      class="mb-3" />
    <UTabs v-model="filter" :items="filters" :content="false" size="sm" class="mb-3" />
    <UProgress v-if="loading" :aria-label="t('inbox.loading')" class="mb-2" />
    <p v-if="list && !list.items.length" class="text-sm text-muted py-3">{{ t('inbox.empty') }}</p>
    <div v-if="list" class="max-h-72 overflow-y-auto space-y-2">
      <button
        v-for="message in list.items"
        :key="message.id"
        type="button"
        class="w-full text-left border border-default rounded p-3 hover:bg-elevated focus-visible:outline-primary"
        @click="open(message)">
        <div class="flex items-start justify-between gap-3">
          <span
            class="min-w-0 break-words"
            :class="message.readAt === null ? 'font-semibold' : 'text-muted'">
            {{ message.title }}
          </span>
          <UBadge v-if="message.readAt === null" size="sm" class="shrink-0">
            {{ t('inbox.unread') }}
          </UBadge>
        </div>
        <span class="text-xs text-muted">{{ formatDate(message.publishedAt) }}</span>
      </button>
    </div>
    <nav
      v-if="list && (list.hasMore || page > 1)"
      class="flex items-center justify-center gap-3 mt-3"
      :aria-label="t('inbox.pages')">
      <UButton
        size="sm"
        variant="outline"
        :disabled="page === 1 || loading"
        @click="load(page - 1)">
        {{ t('inbox.previous') }}
      </UButton>
      <span class="text-sm">{{ page }}</span>
      <UButton
        size="sm"
        variant="outline"
        :disabled="!list.hasMore || page >= 100000 || loading"
        @click="load(page + 1)">
        {{ t('inbox.next') }}
      </UButton>
    </nav>
    <UModal
      :open="!!selected"
      :title="selected?.title"
      :ui="{
        content: 'sm:max-w-2xl',
        title: 'min-w-0 break-words',
        body: 'max-h-[55vh] overflow-y-auto',
      }"
      @update:open="
        (value: boolean) => {
          if (!value) {
            selected = null
            external = null
          }
        }
      ">
      <template #body>
        <template v-if="selected">
          <p class="text-xs text-muted">{{ formatDate(selected.publishedAt) }}</p>
          <InboxBody :body="selected.body" />
        </template>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="selected = null">
          {{ t('inbox.close') }}
        </UButton>
        <UButton v-if="selected?.readAt === null" :loading="busy" @click="mark(selected)">
          {{ t('inbox.markRead') }}
        </UButton>
        <UButton v-if="navigation" variant="soft" @click="navigate">
          {{ t('inbox.openLink') }}
        </UButton>
      </template>
    </UModal>
    <UModal
      :open="!!external"
      :title="t('inbox.externalTitle')"
      :description="t('inbox.externalHint')"
      @update:open="
        (value: boolean) => {
          if (!value) external = null
        }
      ">
      <template #body>
        <p class="text-sm break-all">{{ external }}</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="external = null">
          {{ t('inbox.close') }}
        </UButton>
        <UButton @click="confirmExternal">{{ t('inbox.continue') }}</UButton>
      </template>
    </UModal>
  </UCard>
</template>
