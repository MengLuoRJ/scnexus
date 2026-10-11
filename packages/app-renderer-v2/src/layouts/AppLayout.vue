<script lang="ts" setup>
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import { apiSettingGetSnapshot, apiSettingOnChanged, apiWindowReady } from '../ipcs'
import type { SettingSnapshot } from '@scnexus/app-shared/types/desktop.type'
import AppSidebar from './components/AppSidebar.vue'
defineOptions({ name: 'AppLayout' })
const { t, locale } = useI18n()
const route = useRoute()
function syncLanguage(value: SettingSnapshot) {
  locale.value = value.effectiveLanguage
  document.documentElement.lang = value.effectiveLanguage
}
if (window.scnexus) apiSettingOnChanged(syncLanguage)
onMounted(async () => {
  if (window.scnexus) {
    const result = await apiSettingGetSnapshot()
    if (result.ok) syncLanguage(result.data)
    await apiWindowReady()
  }
})
</script>
<template>
  <div class="flex h-full bg-default text-default">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-default px-3 py-2"
      >
        <h1 class="shrink-0 font-semibold">
          {{
            t(
              route.name === 'campaign'
                ? 'campaign.title'
                : route.name === 'settings'
                  ? 'ui.settings'
                  : 'ui.home',
            )
          }}
        </h1>
        <div
          id="page-actions"
          class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1"
        />
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-3">
        <div class="mx-auto flex min-h-full min-w-0 max-w-5xl flex-col"><RouterView /></div>
      </main>
    </div>
  </div>
</template>
