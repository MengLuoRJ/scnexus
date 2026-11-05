<script lang="ts" setup>
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { AccountError, accountErrorKey } from '../../apis/internal/client'
import {
  apiWorkshopCommunitySummary,
  apiWorkshopReviews,
  apiWorkshopMyReview,
  apiWorkshopCreateReview,
  apiWorkshopUpdateReview,
  apiWorkshopFavorite,
  apiWorkshopSetFavorite,
  type WorkshopPrivateReview,
} from '../../apis/workshop-community'
defineOptions({ name: 'WorkshopCommunity' })
const props = defineProps<{ scnid: number }>()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const summary = shallowRef<Awaited<ReturnType<typeof apiWorkshopCommunitySummary>> | null>(null)
const reviews = shallowRef<Awaited<ReturnType<typeof apiWorkshopReviews>> | null>(null)
const mine = shallowRef<WorkshopPrivateReview | null>(null)
const favorited = shallowRef(false)
const page = shallowRef(1)
const loading = shallowRef(false)
const error = shallowRef<unknown>(null)
const privateReady = shallowRef(false)
const privateError = shallowRef<unknown>(null)
const saving = shallowRef(false)
const favoriting = shallowRef(false)
const recommended = shallowRef(true)
const text = shallowRef('')
const conflict = shallowRef(false)
let generation = 0
let reviewsRequest = 0
let summaryRequest = 0
onScopeDispose(() => {
  generation++
})
const recommendationKeys: Record<string, string> = {
  暂无评价: 'none',
  好评: 'positive',
  特别好评: 'veryPositive',
  好评如潮: 'overwhelmingPositive',
  多半好评: 'mostlyPositive',
  褒贬不一: 'mixed',
  多半差评: 'mostlyNegative',
  差评: 'negative',
  特别差评: 'veryNegative',
  差评如潮: 'overwhelmingNegative',
}
const recommendationLabel = computed(() =>
  summary.value
    ? t(`workshop.community.rating.${recommendationKeys[summary.value.recommendation]}`)
    : '',
)
function fail(value: unknown) {
  if (value instanceof AccountError && value.kind === 'stale') return
  toast.add({ color: 'error', title: t(accountErrorKey(value)) })
}
function fill(review: WorkshopPrivateReview | null) {
  mine.value = review
  recommended.value = review?.recommended ?? true
  text.value = review?.text ?? ''
}
async function load() {
  const current = ++generation
  summary.value = null
  reviews.value = null
  mine.value = null
  text.value = ''
  recommended.value = true
  favorited.value = false
  privateReady.value = false
  privateError.value = null
  error.value = null
  conflict.value = false
  saving.value = false
  favoriting.value = false
  loading.value = true
  const id = props.scnid
  const publicLoad = refreshPublic(current).catch((value: unknown) => {
    if (current === generation) error.value = value
  })
  const privateLoad = auth.signedIn
    ? Promise.all([apiWorkshopMyReview(auth.httpAuth, id), apiWorkshopFavorite(auth.httpAuth, id)])
        .then(([review, favorite]) => {
          if (current === generation) {
            fill(review)
            favorited.value = favorite.favorited
            privateReady.value = true
          }
        })
        .catch((value: unknown) => {
          if (current === generation) privateError.value = value
        })
    : Promise.resolve()
  await Promise.all([publicLoad, privateLoad])
}
watch(
  () => [props.scnid, auth.signedIn, auth.snapshot.epoch, auth.snapshot.sessionId],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
async function login() {
  await router.push({ path: '/account', query: { redirect: route.fullPath } })
}
async function refreshPublic(current: number) {
  const request = ++summaryRequest
  await Promise.all([
    apiWorkshopCommunitySummary(props.scnid).then((stats) => {
      if (current === generation && request === summaryRequest) summary.value = stats
    }),
    loadReviews(page.value),
  ])
}
async function loadReviews(next: number) {
  const current = generation
  const request = ++reviewsRequest
  const id = props.scnid
  const isCurrent = () => current === generation && request === reviewsRequest
  loading.value = true
  try {
    let target = next
    while (isCurrent()) {
      const list = await apiWorkshopReviews(id, target)
      if (!isCurrent()) return
      const lastPage = Math.max(1, Math.ceil(list.total / list.limit))
      if (target > lastPage) {
        target = lastPage
        continue
      }
      reviews.value = list
      page.value = target
      return
    }
  } catch (value) {
    if (isCurrent()) throw value
  } finally {
    if (isCurrent()) loading.value = false
  }
}
async function changePage(next: number) {
  try {
    await loadReviews(next)
  } catch (value) {
    fail(value)
  }
}
async function save() {
  if (saving.value || !privateReady.value || text.value.length > 1000) return
  const current = generation
  saving.value = true
  try {
    const input = { recommended: recommended.value, text: text.value }
    const result = mine.value
      ? await apiWorkshopUpdateReview(auth.httpAuth, props.scnid, {
          ...input,
          expectedRevision: mine.value.revision,
        })
      : await apiWorkshopCreateReview(auth.httpAuth, props.scnid, input)
    if (current !== generation) return
    fill(result)
    conflict.value = false
    toast.add({ color: 'success', title: t('workshop.community.saved') })
    await refreshPublic(current)
  } catch (value) {
    if (current !== generation) return
    if (value instanceof AccountError && value.kind === 'conflict') {
      privateReady.value = false
      conflict.value = true
      try {
        const latest = await apiWorkshopMyReview(auth.httpAuth, props.scnid)
        if (current === generation) {
          mine.value = latest
          privateReady.value = true
        }
      } catch (refreshError) {
        if (current === generation) privateError.value = refreshError
      }
    } else fail(value)
  } finally {
    if (current === generation) saving.value = false
  }
}
async function toggleFavorite() {
  if (favoriting.value || !privateReady.value) return
  const current = generation
  favoriting.value = true
  try {
    const result = await apiWorkshopSetFavorite(auth.httpAuth, props.scnid, !favorited.value)
    if (current !== generation) return
    favorited.value = result.favorited
    toast.add({
      color: 'success',
      title: t(
        result.favorited ? 'workshop.community.favorited' : 'workshop.community.unfavorited',
      ),
    })
    await refreshPublic(current)
  } catch (value) {
    if (current === generation) fail(value)
  } finally {
    if (current === generation) favoriting.value = false
  }
}
</script>
<template>
  <section
    class="space-y-3 border-t border-default pt-4"
    :aria-label="t('workshop.community.title')">
    <div class="flex items-center justify-between gap-3">
      <h3 class="font-semibold">{{ t('workshop.community.title') }}</h3>
      <UButton v-if="!auth.signedIn" variant="soft" @click="login">
        {{ t('workshop.community.login') }}
      </UButton>
      <UButton
        v-else
        :loading="favoriting"
        :disabled="!privateReady"
        :aria-pressed="favorited"
        icon="i-tabler-heart"
        :variant="favorited ? 'solid' : 'outline'"
        @click="toggleFavorite">
        {{ t(favorited ? 'workshop.community.unfavorite' : 'workshop.community.favorite') }}
      </UButton>
    </div>
    <p v-if="summary" class="text-sm text-muted">
      {{ recommendationLabel }} ·
      {{ t('workshop.community.total', { count: summary.totalReviews }) }}
      <span v-if="summary.positiveRate !== null">
        · {{ t('workshop.community.rate', { rate: summary.positiveRate.toFixed(2) }) }}
      </span>
      · {{ t('workshop.community.favoriteCount', { count: summary.favoriteCount }) }}
    </p>
    <UAlert v-if="error" color="error" :title="t(accountErrorKey(error))">
      <template #actions>
        <UButton @click="load">{{ t('workshop.reload') }}</UButton>
      </template>
    </UAlert>
    <UAlert v-if="privateError" color="error" :title="t(accountErrorKey(privateError))">
      <template #actions>
        <UButton @click="load">{{ t('workshop.reload') }}</UButton>
      </template>
    </UAlert>
    <form v-if="auth.signedIn && privateReady" class="space-y-3" @submit.prevent="save">
      <h4 class="text-sm font-medium">{{ t('workshop.community.myReview') }}</h4>
      <UAlert v-if="conflict" color="warning" :title="t('workshop.community.conflict')" />
      <div v-if="conflict" class="text-sm whitespace-pre-wrap break-words">
        {{ t('workshop.community.latest') }}:
        {{
          mine
            ? t(
                mine.recommended
                  ? 'workshop.community.recommended'
                  : 'workshop.community.notRecommended',
              )
            : t('workshop.community.noReview')
        }}
        <p>{{ mine?.text }}</p>
      </div>
      <div class="flex gap-2">
        <UButton
          type="button"
          :disabled="saving"
          :aria-pressed="recommended"
          :variant="recommended ? 'solid' : 'outline'"
          color="success"
          @click="recommended = true">
          {{ t('workshop.community.recommended') }}
        </UButton>
        <UButton
          type="button"
          :disabled="saving"
          :aria-pressed="!recommended"
          :variant="!recommended ? 'solid' : 'outline'"
          color="error"
          @click="recommended = false">
          {{ t('workshop.community.notRecommended') }}
        </UButton>
      </div>
      <UFormField
        :label="t('workshop.community.text')"
        :description="t('workshop.community.textHint')">
        <UTextarea v-model="text" :disabled="saving" :maxlength="1000" :rows="3" class="w-full" />
      </UFormField>
      <p v-if="mine" class="text-xs text-muted">
        {{
          t(
            mine.textVisible
              ? 'workshop.community.visible'
              : mine.visibilitySource === 'PENDING'
                ? 'workshop.community.pending'
                : 'workshop.community.hidden',
          )
        }}
      </p>
      <UButton type="submit" :loading="saving" :disabled="text.length > 1000">
        {{
          t(
            conflict
              ? 'workshop.community.confirmAgain'
              : mine
                ? 'workshop.community.update'
                : 'workshop.community.submit',
          )
        }}
      </UButton>
    </form>
    <UProgress v-if="loading" :aria-label="t('workshop.loading')" />
    <p v-else-if="reviews && !reviews.items.length" class="text-sm text-muted">
      {{ t('workshop.community.empty') }}
    </p>
    <article
      v-for="review in reviews?.items"
      :key="review.id"
      class="border border-default rounded p-3 space-y-2">
      <div class="flex items-center gap-2 text-sm">
        <span class="break-all">{{ review.reviewerNickname }}</span>
        <UBadge :color="review.recommended ? 'success' : 'error'">
          {{
            t(
              review.recommended
                ? 'workshop.community.recommended'
                : 'workshop.community.notRecommended',
            )
          }}
        </UBadge>
      </div>
      <p class="text-sm whitespace-pre-wrap break-words">{{ review.text }}</p>
      <p class="text-xs text-muted">{{ review.createdAt }}</p>
    </article>
    <nav
      v-if="reviews && (reviews.total > reviews.limit || page > 1)"
      class="flex justify-center items-center gap-3"
      :aria-label="t('workshop.community.pagination')">
      <UButton :disabled="page === 1 || loading" variant="outline" @click="changePage(page - 1)">
        {{ t('workshop.previous') }}
      </UButton>
      <span>{{ page }}</span>
      <UButton
        :disabled="page * reviews.limit >= reviews.total || loading"
        variant="outline"
        @click="changePage(page + 1)">
        {{ t('workshop.next') }}
      </UButton>
    </nav>
  </section>
</template>
