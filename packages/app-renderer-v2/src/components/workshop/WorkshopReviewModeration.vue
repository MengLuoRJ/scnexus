<script lang="ts" setup>
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { AccountError, accountErrorKey } from '../../apis/internal/client'
import {
  apiWorkshopReviewModeration,
  apiWorkshopReviewVisibility,
  type WorkshopPrivateReview,
} from '../../apis/workshop-community'
import { useAuthStore } from '../../stores/auth'
import { useCreatorStore } from '../../stores/creator'
import { useContentCenterStore } from '../../stores/content-center'

defineOptions({ name: 'WorkshopReviewModeration' })
const props = defineProps<{ scnid: number }>()
const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const creator = useCreatorStore()
const center = useContentCenterStore()
const allowed = computed(() => center.enabled && auth.signedIn && creator.active)
const items = shallowRef<WorkshopPrivateReview[]>([])
const page = shallowRef(1)
const total = shallowRef(0)
const limit = 20
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef<unknown>(null)
const conflict = shallowRef(false)
let generation = 0
onScopeDispose(() => {
  generation++
})
function operationCurrent() {
  const version = generation
  const id = props.scnid
  const epoch = auth.snapshot.epoch
  const sessionId = auth.snapshot.sessionId
  return () =>
    version === generation &&
    id === props.scnid &&
    allowed.value &&
    epoch === auth.snapshot.epoch &&
    sessionId === auth.snapshot.sessionId
}
async function load() {
  generation++
  const current = operationCurrent()
  items.value = []
  total.value = 0
  error.value = null
  saving.value = false
  loading.value = allowed.value
  if (!allowed.value) return
  try {
    const result = await apiWorkshopReviewModeration(auth.httpAuth, props.scnid, page.value, limit)
    if (!current()) return
    total.value = result.total
    const lastPage = Math.max(1, Math.ceil(result.total / limit))
    if (page.value > lastPage) {
      page.value = lastPage
      await load()
      return
    }
    items.value = result.items
  } catch (value) {
    if (current()) error.value = value
  } finally {
    if (current()) loading.value = false
  }
}
watch(
  () => [props.scnid, allowed.value, auth.snapshot.epoch, auth.snapshot.sessionId],
  () => {
    page.value = 1
    conflict.value = false
    void load()
  },
  { immediate: true },
)
function changePage(value: number) {
  if (loading.value || saving.value) return
  page.value = value
  conflict.value = false
  void load()
}
async function setVisibility(item: WorkshopPrivateReview, visible: boolean) {
  if (
    !allowed.value ||
    loading.value ||
    saving.value ||
    error.value ||
    item.visibilitySource === 'ADMIN' ||
    (visible && !item.text.trim())
  )
    return
  const current = operationCurrent()
  saving.value = true
  conflict.value = false
  try {
    const result = await apiWorkshopReviewVisibility(
      auth.httpAuth,
      props.scnid,
      item.id,
      item.revision,
      visible,
    )
    if (!current()) return
    items.value = items.value.map((review) => (review.id === result.id ? result : review))
    toast.add({ color: 'success', title: t('workshop.community.visibilitySaved') })
  } catch (value) {
    if (!current()) return
    if (value instanceof AccountError && value.kind === 'conflict') {
      conflict.value = true
      await load()
    } else if (!(value instanceof AccountError && value.kind === 'stale')) {
      toast.add({
        color: 'error',
        title:
          value instanceof AccountError
            ? t(accountErrorKey(value))
            : t('workshop.community.operationError'),
      })
    }
  } finally {
    if (current()) saving.value = false
  }
}
</script>

<template>
  <UCard :ui="{ body: 'space-y-3 p-3' }">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-semibold">{{ t('workshop.community.moderationTitle') }}</h2>
      <UButton size="xs" variant="outline" :disabled="loading || saving || !allowed" @click="load">
        {{ t('workshop.community.reload') }}
      </UButton>
    </div>
    <p class="text-sm text-muted">{{ t('workshop.community.moderationHint') }}</p>
    <UAlert v-if="conflict" color="warning" :title="t('workshop.community.moderationConflict')" />
    <UProgress v-if="loading" />
    <UAlert v-else-if="error" color="error" :title="t(accountErrorKey(error))" />
    <template v-else-if="allowed">
      <p v-if="!items.length" class="text-sm text-muted">
        {{ t('workshop.community.noModerationReviews') }}
      </p>
      <article
        v-for="item in items"
        :key="item.id"
        class="space-y-2 border border-default rounded p-3">
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="min-w-0 break-all font-medium">{{ item.reviewerNickname }}</span>
          <UBadge class="shrink-0" :color="item.recommended ? 'success' : 'neutral'" variant="soft">
            {{
              t(
                item.recommended
                  ? 'workshop.community.recommended'
                  : 'workshop.community.notRecommended',
              )
            }}
          </UBadge>
        </div>
        <p class="text-xs text-muted">{{ item.createdAt }}</p>
        <p v-if="item.text" class="whitespace-pre-wrap break-words text-sm">{{ item.text }}</p>
        <p v-else class="text-sm text-muted">{{ t('workshop.community.noReviewText') }}</p>
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-muted">
            {{
              t(
                item.textVisible
                  ? 'workshop.community.textVisible'
                  : 'workshop.community.textHidden',
              )
            }}
            · {{ t(`workshop.community.visibility${item.visibilitySource}`) }}
          </span>
          <UButton
            v-if="item.visibilitySource !== 'ADMIN'"
            size="xs"
            variant="outline"
            :disabled="
              loading || saving || Boolean(error) || (!item.textVisible && !item.text.trim())
            "
            @click="setVisibility(item, !item.textVisible)">
            {{
              t(item.textVisible ? 'workshop.community.hideText' : 'workshop.community.showText')
            }}
          </UButton>
          <span v-else class="text-xs text-muted">{{ t('workshop.community.adminLocked') }}</span>
        </div>
      </article>
      <div v-if="total > limit" class="flex items-center justify-center gap-3">
        <UButton
          size="xs"
          variant="outline"
          :disabled="page <= 1 || loading || saving"
          @click="changePage(page - 1)">
          {{ t('workshop.community.previous') }}
        </UButton>
        <span class="text-xs text-muted">{{ page }} / {{ Math.ceil(total / limit) }}</span>
        <UButton
          size="xs"
          variant="outline"
          :disabled="page * limit >= total || loading || saving"
          @click="changePage(page + 1)">
          {{ t('workshop.community.next') }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>
