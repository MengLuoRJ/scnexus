<script lang="ts" setup>
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { apiWorkshopDetail, apiWorkshopList, type WorkshopProject } from '../../apis/workshop'
import { accountErrorKey } from '../../apis/internal/client'
import { useCreatorStore } from '../../stores/creator'
import { useAuthStore } from '../../stores/auth'
import { useContentCenterStore } from '../../stores/content-center'
import { useWorkshopStore, unwrapWorkshop } from '../../stores/workshop'
import { ipcShellOpenExternalWebsite, ipcShellOpenExternalDownload } from '../../ipcs/shell'
import WorkshopRichText from '../../components/workshop/WorkshopRichText.vue'
import WorkshopCommunity from '../../components/workshop/WorkshopCommunity.vue'
import WorkshopFavorites from '../../components/workshop/WorkshopFavorites.vue'
defineOptions({ name: 'WorkshopView' })
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const creator = useCreatorStore()
const auth = useAuthStore()
const center = useContentCenterStore()
const transfers = useWorkshopStore()
onScopeDispose(() => {
  generation++
})
const query = shallowRef('')
const page = shallowRef(1)
const items = shallowRef<WorkshopProject[]>([])
const detail = shallowRef<WorkshopProject | null>(null)
const loading = shallowRef(false)
const error = shallowRef<unknown>(null)
const downloading = shallowRef(false)
const externalDownload = shallowRef<string | null>(null)
const externalHost = computed(() =>
  externalDownload.value ? new URL(externalDownload.value).host : '',
)
const id = computed(() => (route.params.scnid ? Number(route.params.scnid) : null))
const favorites = computed(() => id.value === null && route.query.tab === 'favorites')
let intentGeneration = 0
watch(
  () => [route.query.download, route.params.scnid],
  async () => {
    const current = ++intentGeneration
    if (route.query.download !== 'true' || !id.value) return
    try {
      await center.initialize()
      if (current !== intentGeneration) return
      if (!center.enabled) {
        toast.add({ color: 'warning', title: t('workshop.disabled') })
        return
      }
      const project = await apiWorkshopDetail(id.value!)
      if (current !== intentGeneration) return
      if (!project.approvedVersionId) {
        const query = { ...route.query }
        delete query.download
        await router.replace({ path: route.path, query })
        return
      }
      await auth.initialize()
      if (current !== intentGeneration) return
      if (!auth.signedIn) {
        await router.replace({ path: '/account', query: { redirect: route.fullPath } })
        return
      }
      transfers.openDownload(id.value!)
      const query = { ...route.query }
      delete query.download
      await router.replace({ path: route.path, query })
    } catch {
      toast.add({ color: 'error', title: t('workshop.operationError') })
    }
  },
  { immediate: true },
)
onScopeDispose(() => {
  intentGeneration++
})
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true
  error.value = null
  detail.value = null
  externalDownload.value = null
  if (!center.enabled || favorites.value) {
    loading.value = false
    items.value = []
    return
  }
  try {
    if (id.value !== null) {
      const result = await apiWorkshopDetail(id.value)
      if (current === generation) detail.value = result
    } else {
      const result = await apiWorkshopList(page.value, query.value)
      if (current === generation) items.value = result.items
    }
  } catch (value) {
    if (current === generation) error.value = value
  } finally {
    if (current === generation) loading.value = false
  }
}
watch([id, page, favorites, () => center.enabled], load, { immediate: true })
function search() {
  if (page.value !== 1) page.value = 1
  else void load()
}
async function download() {
  if (!detail.value?.approvedVersionId || !center.enabled) return
  if (!auth.signedIn) {
    await router.push({ path: '/account', query: { redirect: `${route.path}?download=true` } })
    return
  }
  transfers.openDownload(detail.value.scnid)
}
async function confirmExternalDownload() {
  const url = externalDownload.value
  externalDownload.value = null
  if (!url || !center.enabled) return
  try {
    unwrapWorkshop(await ipcShellOpenExternalDownload(url))
  } catch {
    toast.add({ color: 'error', title: t('workshop.linkError') })
  }
}
async function openLink(url: string) {
  try {
    unwrapWorkshop(await ipcShellOpenExternalWebsite(url))
  } catch {
    toast.add({ color: 'error', title: t('workshop.linkError') })
  }
}
</script>
<template>
  <section class="h-full min-h-0 overflow-y-auto p-4 space-y-4">
    <header class="flex items-center justify-between gap-3">
      <h1 class="text-xl font-semibold">{{ t('workshop.title') }}</h1>
      <div class="flex gap-2">
        <UButton
          :to="favorites ? '/workshop' : '/workshop?tab=favorites'"
          variant="outline"
          color="neutral">
          {{ t(favorites ? 'workshop.back' : 'workshop.community.favorites') }}
        </UButton>
        <UButton to="/downloads" variant="outline" color="neutral">
          {{ t('workshop.downloads') }}
        </UButton>
        <UButton v-if="creator.active" to="/creator" variant="soft">
          {{ t('workshop.creator') }}
        </UButton>
      </div>
    </header>
    <UAlert v-if="!center.enabled" :title="t('workshop.disabled')" color="warning" />
    <WorkshopFavorites v-else-if="favorites" />
    <template v-else>
      <form v-if="id === null" class="flex gap-2" @submit.prevent="search">
        <UInput
          v-model="query"
          :maxlength="120"
          :placeholder="t('workshop.search')"
          class="flex-1"
          :aria-label="t('workshop.search')" />
        <UButton type="submit" :loading="loading">{{ t('workshop.search') }}</UButton>
      </form>
      <div v-if="loading" role="status"><UProgress :aria-label="t('workshop.loading')" /></div>
      <UAlert v-else-if="error" :title="t(accountErrorKey(error))" color="error">
        <template #actions>
          <UButton @click="load">{{ t('workshop.reload') }}</UButton>
        </template>
      </UAlert>
      <article v-else-if="detail" class="space-y-4">
        <UButton to="/workshop" variant="link">{{ t('workshop.back') }}</UButton>
        <div class="flex gap-4 items-start justify-between">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold break-words">{{ detail.title }}</h2>
            <p class="text-xs text-muted">SCNID {{ detail.scnid }}</p>
            <p class="mt-2 whitespace-pre-wrap break-words text-sm">{{ detail.description }}</p>
          </div>
          <UButton
            v-if="detail.approvedVersionId"
            class="shrink-0"
            :loading="downloading"
            :disabled="!detail.approvedVersionId"
            @click="download">
            {{ t(auth.signedIn ? 'workshop.download' : 'workshop.loginDownload') }}
          </UButton>
        </div>
        <div v-if="detail.downloadLinks?.length" class="space-y-2">
          <h3 class="font-medium">{{ t('workshop.downloadLinks') }}</h3>
          <div
            v-for="link in detail.downloadLinks"
            :key="link.url"
            class="space-y-1 border border-default rounded p-3">
            <p class="text-sm break-all">{{ link.url }}</p>
            <p v-if="link.description" class="text-sm whitespace-pre-wrap break-words">
              {{ link.description }}
            </p>
            <UButton size="sm" variant="outline" @click="externalDownload = link.url">
              {{ t('workshop.externalDownload') }}
            </UButton>
          </div>
        </div>
        <UAlert
          v-if="detail.approvedVersionId"
          :title="t('workshop.downloadSafety')"
          color="neutral" />
        <WorkshopRichText :document="detail.detail" :project-scnid="detail.scnid" />
        <WorkshopCommunity :scnid="detail.scnid" />
        <div v-if="detail.website" class="text-sm break-all">
          <span>{{ t('workshop.website') }}:</span>
          <UButton variant="link" @click="openLink(detail.website)">{{ detail.website }}</UButton>
        </div>
        <div
          v-for="(value, key) in { ...detail.social, ...detail.sponsor }"
          :key="key"
          class="text-sm break-all">
          <span>{{ key }}: {{ value }}</span>
          <UButton
            v-if="/^https:\/\//i.test(value)"
            size="xs"
            variant="link"
            @click="openLink(value)">
            {{ t('workshop.openLink') }}
          </UButton>
        </div>
      </article>
      <template v-else-if="id === null">
        <p v-if="!items.length" class="text-muted py-6 text-center">{{ t('workshop.empty') }}</p>
        <div class="grid grid-cols-2 gap-3">
          <UCard v-for="item in items" :key="item.scnid" :ui="{ body: 'p-3' }">
            <h2 class="font-medium truncate">{{ item.title }}</h2>
            <p class="text-xs text-muted">SCNID {{ item.scnid }}</p>
            <p class="line-clamp-3 text-sm text-muted my-2 break-words">{{ item.description }}</p>
            <UButton :to="`/workshop/${item.scnid}`" variant="soft" size="sm">
              {{ t('workshop.details') }}
            </UButton>
          </UCard>
        </div>
        <nav class="flex justify-center items-center gap-3" :aria-label="t('workshop.pagination')">
          <UButton :disabled="page === 1" color="neutral" variant="outline" @click="page--">
            {{ t('workshop.previous') }}
          </UButton>
          <span class="text-sm">{{ page }}</span>
          <UButton :disabled="items.length < 12" color="neutral" variant="outline" @click="page++">
            {{ t('workshop.next') }}
          </UButton>
        </nav>
      </template>
    </template>
    <UModal
      :open="!!externalDownload"
      :title="t('workshop.externalDownload')"
      :description="t('workshop.externalDownloadRisk', { host: externalHost })"
      @update:open="
        (value: boolean) => {
          if (!value) externalDownload = null
        }
      ">
      <template #body>
        <p class="text-sm break-all">{{ externalDownload }}</p>
        <p class="mt-2 text-sm text-muted">{{ t('workshop.externalDownloadHint') }}</p>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="externalDownload = null">
          {{ t('workshop.cancel') }}
        </UButton>
        <UButton @click="confirmExternalDownload">{{ t('workshop.openBrowser') }}</UButton>
      </template>
    </UModal>
  </section>
</template>
