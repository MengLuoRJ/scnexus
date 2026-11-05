<script lang="ts" setup>
import { onScopeDispose, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { AccountError, accountErrorKey } from '../../apis/internal/client'
import { apiWorkshopFavorites, apiWorkshopSetFavorite } from '../../apis/workshop-community'
defineOptions({ name: 'WorkshopFavorites' })
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const list = shallowRef<Awaited<ReturnType<typeof apiWorkshopFavorites>> | null>(null)
const page = shallowRef(1)
const loading = shallowRef(false)
const removing = shallowRef<number | null>(null)
const error = shallowRef<unknown>(null)
let generation = 0
onScopeDispose(() => {
  generation++
})
async function load() {
  const current = ++generation
  list.value = null
  error.value = null
  removing.value = null
  loading.value = false
  if (!auth.signedIn) return
  loading.value = true
  try {
    const result = await apiWorkshopFavorites(auth.httpAuth, page.value, 12)
    if (current === generation) {
      if (!result.items.length && page.value > 1) {
        page.value--
        return
      }
      list.value = result
    }
  } catch (value) {
    if (current === generation) error.value = value
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(
  () => [auth.signedIn, auth.snapshot.epoch, auth.snapshot.sessionId],
  () => {
    page.value = 1
    void load()
  },
  { immediate: true },
)
watch(page, load)
async function remove(id: number) {
  if (removing.value !== null || loading.value) return
  const current = generation
  removing.value = id
  try {
    await apiWorkshopSetFavorite(auth.httpAuth, id, false)
    if (current !== generation) return
    toast.add({ color: 'success', title: t('workshop.community.unfavorited') })
    await load()
  } catch (value) {
    if (current === generation && !(value instanceof AccountError && value.kind === 'stale'))
      toast.add({ color: 'error', title: t(accountErrorKey(value)) })
  } finally {
    if (current === generation) removing.value = null
  }
}
</script>
<template>
  <section class="space-y-3" :aria-label="t('workshop.community.favorites')">
    <h2 class="font-semibold">{{ t('workshop.community.favorites') }}</h2>
    <UButton
      v-if="!auth.signedIn"
      @click="router.push({ path: '/account', query: { redirect: route.fullPath } })">
      {{ t('workshop.community.login') }}
    </UButton>
    <UProgress v-else-if="loading" :aria-label="t('workshop.loading')" />
    <UAlert v-else-if="error" color="error" :title="t(accountErrorKey(error))">
      <template #actions>
        <UButton @click="load">{{ t('workshop.reload') }}</UButton>
      </template>
    </UAlert>
    <template v-else-if="list">
      <p v-if="!list.items.length" class="text-sm text-muted">
        {{ t('workshop.community.noFavorites') }}
      </p>
      <div class="grid grid-cols-2 gap-3">
        <UCard v-for="item in list.items" :key="item.scnid" class="min-w-0">
          <h3 class="font-semibold break-words">{{ item.title }}</h3>
          <p class="text-xs text-muted">SCNID {{ item.scnid }}</p>
          <p class="line-clamp-3 text-sm text-muted my-2 break-words">{{ item.description }}</p>
          <div class="flex gap-2">
            <UButton :to="`/workshop/${item.scnid}`" variant="soft" size="sm">
              {{ t('workshop.details') }}
            </UButton>
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :loading="removing === item.scnid"
              :disabled="removing !== null"
              @click="remove(item.scnid)">
              {{ t('workshop.community.unfavorite') }}
            </UButton>
          </div>
        </UCard>
      </div>
      <nav
        v-if="list.total > list.limit || page > 1"
        class="flex justify-center items-center gap-3"
        :aria-label="t('workshop.pagination')">
        <UButton :disabled="page === 1 || removing !== null" variant="outline" @click="page--">
          {{ t('workshop.previous') }}
        </UButton>
        <span>{{ page }}</span>
        <UButton
          :disabled="page * list.limit >= list.total || removing !== null"
          variant="outline"
          @click="page++">
          {{ t('workshop.next') }}
        </UButton>
      </nav>
    </template>
  </section>
</template>
