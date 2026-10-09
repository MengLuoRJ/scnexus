<script lang="ts" setup>
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import logo from "../../assets/logo.png";

defineOptions({ name: "AppSidebar" });
const { t } = useI18n();
const collapsed = ref(false);
const items = computed(() => [
  { label: t("ui.home"), icon: "i-tabler-home", to: "/", exact: true },
  { label: t("campaign.title"), icon: "i-tabler-map", to: "/campaign" },
  { label: t("ui.settings"), icon: "i-tabler-settings", to: "/settings" },
]);
</script>

<template>
  <aside
    :class="collapsed ? 'w-16' : 'w-40'"
    class="flex shrink-0 flex-col border-r border-default bg-elevated/50 transition-[width]"
  >
    <div class="flex h-16 items-center justify-center gap-2 border-b border-default px-2">
      <img :src="logo" alt="SCNexus" class="size-8 shrink-0 object-contain" />
      <span v-if="!collapsed" class="truncate font-semibold">星际枢纽</span>
    </div>
    <UNavigationMenu
      :items="items"
      :collapsed="collapsed"
      orientation="vertical"
      class="flex-1 p-2"
      :ui="{ link: collapsed ? 'justify-center' : '', linkLeadingIcon: 'shrink-0' }"
    />
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
