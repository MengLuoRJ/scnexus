<script lang="ts" setup>
import { onMounted, onUnmounted, watch } from 'vue'
import { useContentCenterStore } from '../stores/content-center'
import { useCreatorStore } from '../stores/creator'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import { ipcSettingGetSnapshot, ipcSettingOnChanged, ipcWindowReady } from '../ipcs'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import { useWorkshopStore } from '../stores/workshop'
import { useToast } from '@nuxt/ui/composables/useToast'
import { ipcDeepLinkOnWorkshop } from '../ipcs/deep-link'
import DownloadWizard from '../components/workshop/DownloadWizard.vue'
import AppSidebar from './components/AppSidebar.vue'
defineOptions({ name: 'AppLayout' })
const { t, locale } = useI18n()
const route = useRoute()
const auth = useAuthStore()
const contentCenter = useContentCenterStore()
const creator = useCreatorStore()
const router = useRouter()
const transfers = useWorkshopStore()
const toast = useToast()
let deepLinkGeneration = 0
if (window.scnexus)
  ipcDeepLinkOnWorkshop(async (intent) => {
    const current = ++deepLinkGeneration
    try {
      await contentCenter.initialize()
      if (current !== deepLinkGeneration) return
      if (!contentCenter.enabled) {
        toast.add({ color: 'warning', title: t('workshop.disabled') })
        return
      }
      await router.push({
        path: `/workshop/${intent.scnid}`,
        query: intent.download ? { download: 'true' } : {},
      })
    } catch {
      toast.add({ color: 'error', title: t('workshop.operationError') })
    }
  })
onUnmounted(() => {
  deepLinkGeneration++
})
let stopTransfers: (() => void) | undefined
if (window.scnexus) stopTransfers = transfers.connect()
const completed = new Set<string>()
watch(
  () => transfers.tasks,
  (tasks, previous = []) => {
    for (const task of tasks)
      if (
        task.status === 'completed' &&
        !completed.has(task.taskId) &&
        previous.some((old) => old.taskId === task.taskId && old.status === 'running')
      ) {
        completed.add(task.taskId)
        toast.add({
          color: 'success',
          title: t(task.kind === 'download' ? 'workshop.downloadDone' : 'workshop.uploadDone'),
        })
      }
  },
)
onUnmounted(() => stopTransfers?.())
watch(
  () => creator.active,
  (active) => {
    if (!active && !creator.loading && route.meta.creator) void router.replace('/account')
  },
)
watch(
  () => contentCenter.enabled,
  (enabled) => {
    if (!enabled && route.meta.workshop) void router.replace('/')
  },
)
onUnmounted(() => auth.dispose())
function syncLanguage(value: SettingSnapshot) {
  contentCenter.accept(value)
  locale.value = value.effectiveLanguage
  document.documentElement.lang = value.effectiveLanguage
}
if (window.scnexus) ipcSettingOnChanged(syncLanguage)
onMounted(async () => {
  void contentCenter.initialize().catch(() => {})
  void auth.initialize()
  if (window.scnexus) {
    const result = await ipcSettingGetSnapshot()
    if (result.ok) syncLanguage(result.data)
    await ipcWindowReady()
  }
})
</script>
<template>
  <div class="flex h-full bg-default text-default">
    <AppSidebar />
    <DownloadWizard />
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2"
      >
        <h1 class="shrink-0 font-semibold">
          {{
            t(
              route.meta.titleKey
                ? (route.meta.titleKey as string)
                : route.name === 'campaign'
                  ? 'campaign.title'
                  : route.name === 'weekly-mutations'
                    ? 'weekly.title'
                    : route.name === 'customize'
                      ? 'customize.title'
                      : route.name === 'settings'
                        ? 'ui.settings'
                        : route.name === 'account'
                          ? 'account.title'
                          : 'ui.home',
            )
          }}
        </h1>
        <div
          id="page-actions"
          class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1"
        >
          <UButton
            v-if="route.path.startsWith('/editor-toolbox/')"
            to="/editor-toolbox"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-tabler-arrow-left"
            >{{ t('toolbox.back') }}</UButton
          >
        </div>
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto" :class="route.name === 'account' ? '' : 'p-3'">
        <div
          class="flex min-h-full min-w-0 flex-col"
          :class="route.name === 'account' ? 'w-full' : 'mx-auto max-w-5xl'"
        >
          <RouterView />
        </div>
      </main>
    </div>
  </div>
</template>
