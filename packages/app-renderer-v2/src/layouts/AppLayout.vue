<script lang="ts" setup>
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterView, useRoute } from "vue-router";
import { apiSettingGetSnapshot, apiSettingOnChanged, apiWindowReady } from "../ipcs";
import type { SettingSnapshot } from "@scnexus/app-shared/types/desktop.type";
defineOptions({ name: "AppLayout" });
const { t, locale } = useI18n();
const route = useRoute();
const collapsed = ref(false);
const items = computed(() => [
  { label: t("ui.home"), icon: "i-tabler-home", to: "/", exact: true },
  { label: t("ui.settings"), icon: "i-tabler-settings", to: "/settings" },
]);
function syncLanguage(value: SettingSnapshot) {
  locale.value = value.effectiveLanguage;
  document.documentElement.lang = value.effectiveLanguage;
}
if (window.scnexus) apiSettingOnChanged(syncLanguage);
onMounted(async () => {
  if (window.scnexus) {
    const result = await apiSettingGetSnapshot();
    if (result.ok) syncLanguage(result.data);
    await apiWindowReady();
  }
});
</script>
<template>
  <div class="flex h-full bg-default text-default">
    <aside
      :class="collapsed ? 'w-16' : 'w-56'"
      class="flex shrink-0 flex-col border-r border-default bg-elevated/50 transition-[width]"
    >
      <div class="flex h-16 items-center justify-center gap-2 border-b border-default px-3">
        <UIcon name="i-tabler-planet" class="size-7 shrink-0 text-primary" /><span
          v-if="!collapsed"
          class="truncate font-semibold"
          >星际枢纽</span
        >
      </div>
      <UNavigationMenu
        :items="items"
        :collapsed="collapsed"
        orientation="vertical"
        class="flex-1 p-2"
      />
      <div class="border-t border-default p-2">
        <UButton
          :icon="
            collapsed
              ? 'i-tabler-layout-sidebar-left-expand'
              : 'i-tabler-layout-sidebar-left-collapse'
          "
          :aria-label="t(collapsed ? 'ui.expand' : 'ui.collapse')"
          :label="collapsed ? undefined : t('ui.collapse')"
          color="neutral"
          variant="ghost"
          block
          @click="collapsed = !collapsed"
        />
      </div>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 shrink-0 items-center border-b border-default px-6">
        <h1 class="font-semibold">
          {{ t(route.name === "settings" ? "ui.settings" : "ui.home") }}
        </h1>
        <UBadge label="SCNexus" variant="subtle" color="neutral" class="ml-auto" />
      </header>
      <main class="min-h-0 flex-1 overflow-y-auto p-6">
        <div class="mx-auto max-w-4xl"><RouterView /></div>
      </main>
    </div>
  </div>
</template>
