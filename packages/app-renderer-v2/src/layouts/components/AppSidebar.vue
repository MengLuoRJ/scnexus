<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useContentCenterStore } from '../../stores/content-center'
import { useCreatorStore } from '../../stores/creator'
import workshopIcon from '../../assets/menu/Menu_Creator.png'
import logo from '../../assets/logo.png'
import campaignIcon from '../../assets/menu/Menu_GamePlay.png'
import customizeIcon from '../../assets/menu/Menu_Customize.png'
import coopIcon from '../../assets/menu/Menu_Coop.png'
import settingsIcon from '../../assets/menu/Menu_Setting.png'

defineOptions({ name: 'AppSidebar' })
const { t } = useI18n()
const collapsed = ref(false)
const auth = useAuthStore()
const contentCenter = useContentCenterStore()
const creator = useCreatorStore()
const route = useRoute()
const accountName = computed(() =>
  auth.signedIn ? auth.user?.nickname || t('account.loading') : t('account.notSignedIn'),
)
const accountLabel = computed(() => `${t('account.title')} · ${accountName.value}`)
const items = computed(() => [
  { label: t('ui.home'), image: logo, to: '/', exact: true },
  { label: t('campaign.title'), image: campaignIcon, to: '/campaign' },
  { label: t('customize.title'), image: customizeIcon, to: '/customize' },
  { label: t('weekly.title'), image: coopIcon, to: '/weekly-mutations' },
  { label: t('toolbox.title'), image: customizeIcon, to: '/editor-toolbox' },
  ...(contentCenter.enabled
    ? [{ label: t('contentCenter.workshop'), image: workshopIcon, to: '/workshop' }]
    : []),
  { label: t('contentCenter.downloads'), image: campaignIcon, to: '/downloads' },
  ...(creator.active
    ? [
        { label: t('contentCenter.creator'), image: workshopIcon, to: '/creator' },
        { label: t('contentCenter.uploads'), image: campaignIcon, to: '/uploads' },
      ]
    : []),
  { label: t('ui.settings'), image: settingsIcon, to: '/settings' },
])
</script>

<template>
  <aside
    :class="collapsed ? 'w-16' : 'w-40'"
    class="flex shrink-0 flex-col border-r border-default bg-elevated/50 transition-[width]"
  >
    <div class="flex h-14 shrink-0 items-center justify-center gap-2 border-b border-default px-2">
      <img draggable="false" :src="logo" alt="SCNexus" class="size-8 shrink-0 object-contain" />
      <span v-if="!collapsed" class="truncate font-semibold">星际枢纽</span>
    </div>
    <UNavigationMenu
      :items="items"
      :collapsed="collapsed"
      orientation="vertical"
      class="flex-1 p-2"
      :ui="{ link: collapsed ? 'justify-center' : '' }"
    >
      <template #item-leading="{ item }">
        <img draggable="false" :src="item.image" alt="" class="size-8 shrink-0 object-contain" />
      </template>
    </UNavigationMenu>
    <div class="border-t border-default p-2">
      <RouterLink
        to="/account"
        :aria-label="accountLabel"
        :title="accountLabel"
        :aria-current="route.name === 'account' ? 'page' : undefined"
        class="flex min-w-0 items-center gap-2 rounded-md p-1.5 transition-colors hover:bg-accented focus-visible:outline-2 focus-visible:outline-primary"
        :class="[collapsed ? 'justify-center' : '', route.name === 'account' ? 'bg-accented' : '']"
      >
        <UAvatar icon="i-tabler-user" size="sm" aria-hidden="true" class="shrink-0" />
        <span v-if="!collapsed" class="min-w-0 truncate text-sm font-medium" aria-live="polite">{{
          accountName
        }}</span>
      </RouterLink>
    </div>
    <div class="flex justify-center border-t border-default p-2">
      <UButton
        :icon="
          collapsed
            ? 'i-tabler-layout-sidebar-left-expand'
            : 'i-tabler-layout-sidebar-left-collapse'
        "
        :aria-label="t(collapsed ? 'ui.expand' : 'ui.collapse')"
        :title="t(collapsed ? 'ui.expand' : 'ui.collapse')"
        color="neutral"
        variant="ghost"
        @click="collapsed = !collapsed"
      />
    </div>
  </aside>
</template>
