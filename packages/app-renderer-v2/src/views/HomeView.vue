<script lang="ts" setup>
import { useI18n } from "vue-i18n";
import logo from "../assets/logo.png";
defineOptions({ name: "HomeView" });
const { t } = useI18n();
</script>
<template>
  <section class="flex min-h-[65vh] flex-col items-center justify-center text-center">
    <div class="mb-8 rounded-3xl bg-primary/10 p-7">
      <img :src="logo" alt="SCNexus" class="size-24 object-contain" />
    </div>
    <UBadge label="SCNexus · 星际枢纽" variant="subtle" class="mb-4" />
    <h2 class="text-3xl font-bold tracking-tight">{{ t("ui.welcome") }}</h2>
    <p class="mt-4 max-w-lg text-base leading-7 text-muted">{{ t("ui.intro") }}</p>
    <UButton to="/settings" icon="i-tabler-settings" size="lg" class="mt-8">{{
      t("ui.start")
    }}</UButton>
  </section>
</template>
