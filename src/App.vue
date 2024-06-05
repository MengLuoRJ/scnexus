<script setup lang="ts">
import { onMounted } from "vue";
import { RouterView } from "vue-router";
import { set, get } from "@vueuse/core";
import { useHead } from "@unhead/vue";

import { useLocaleStore } from "@/stores/locale";
import { useUserStore } from "./stores/user";

import NaiveProvider from "@/components/NaiveProvider.vue";

import { useLocale } from "@/composables/useTrans";
import { useI18n } from "vue-i18n";
import { ipcSetting } from "./apis/ipcs/setting";
import { initUpdater } from "./composables/useUpdater";


const localeStore = useLocaleStore();
const locale = useLocale();

const userStore = useUserStore();

const { t } = useI18n();

useHead({
  title: () => t("base.APP_NAME"),
});

onMounted(async () => {
  await localeStore.initLocale();
  set(locale, get(localeStore.current));

  const { data: setting_client_id } = await ipcSetting.getSettingKey(
    "CLIENT_ID"
  );
  await userStore.setClientId(setting_client_id as string);
  await userStore.initUser();

  await initUpdater();

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
