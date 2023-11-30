<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import NaiveProvider from "@/components/NaiveProvider.vue";
import { useLocaleStore } from "@/stores/locale";
import { set, get } from "@vueuse/core";
import { useLocale } from "@/composables/useTrans";
import { useI18n } from "vue-i18n";
import { useHead } from "@unhead/vue";

const localeStore = useLocaleStore();
const locale = useLocale();

const { t } = useI18n();

useHead({
  title: () => t("base.APP_NAME"),
});

onMounted(async () => {
  await localeStore.initLocale();
  set(locale, get(localeStore.current));
});
</script>

<template>
  <div class="app">
    <NaiveProvider>
      <RouterView />
    </NaiveProvider>
  </div>
</template>

<style></style>
