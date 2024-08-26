<script setup lang="ts">
import { useFetch } from "@/composables/useFetch";
import { get } from "@vueuse/core";
import { onMounted } from "vue";

async function getCustomizeList() {
  const { data, error } = await useFetch("/workshop/customize/list/creator")
    .post()
    .json();
  if (get(error)) {
    console.warn(error);
  }
  if (get(data)) {
    console.log(get(data));
    return get(data);
  }
}

async function getCustomizeDraftList(snid: string) {}


onMounted(async () => {
  await getCustomizeList();
})
</script>
<template>
  <div>{{ "1" }}</div>
</template>
