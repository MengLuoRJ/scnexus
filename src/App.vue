<script setup lang="ts">
import { RouterView } from "vue-router";
import NaiveProvider from "@/components/NaiveProvider.vue";
</script>

<template>
  <div class="app">
    <NaiveProvider>
      <RouterView />
    </NaiveProvider>
  </div>
</template>

<style></style>
