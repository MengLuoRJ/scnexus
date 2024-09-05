<script setup lang="ts">
import VersionUpdator from "./VersionUpdater.vue";
import LocalesChanger from "./LocalesChanger.vue";
</script>
<template>
  <div class="flex flex-col justify-center items-center gap-2">
    <div class="w-full"><LocalesChanger /></div>
    <div class="w-full"><VersionUpdator /></div>
  </div>
</template>
