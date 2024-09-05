<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from "vue";
import { useGet } from "@/composables/useDataPA";
import { get, set } from "@vueuse/core";

const activeLobbiesCount = ref({ 1: 0, 2: 0, 3: 0, 5: 0 });
let timer: number | undefined = undefined;

async function updateCounters() {
  try {
    activeLobbiesCount.value = await getActiveLobbiesCount();
  } catch (error) {
    window.clearInterval(timer);
    activeLobbiesCount.value = { 1: 0, 2: 0, 3: 0, 5: 0 };
  }
}

async function getActiveLobbiesCount() {
  const { data, error } = await useGet("/lobby/count");
  if (get(error)) {
    console.log(error);
    return null;
  }
  if (get(data)) {
    return get(data).data;
  }
}

onMounted(async () => {
  timer = window.setInterval(async () => {
    await updateCounters();
  }, 1000 * 30);
  await updateCounters();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <div class="flex flex-row justify-center items-center gap-6">
    <n-statistic
      :label="'亚服'"
      class="flex flex-col justify-center items-center"
    >
      <n-number-animation
        ref="activeLobbiesCounterRef_Asia"
        :from="0"
        :to="activeLobbiesCount?.['3']"
      />
    </n-statistic>
    <n-statistic
      :label="'美服'"
      class="flex flex-col justify-center items-center"
    >
      <n-number-animation
        ref="activeLobbiesCounterRef_US"
        :from="0"
        :to="activeLobbiesCount?.['1']"
      />
    </n-statistic>
    <n-statistic
      :label="'欧服'"
      class="flex flex-col justify-center items-center"
    >
      <n-number-animation
        ref="activeLobbiesCounterRef_EU"
        :from="0"
        :to="activeLobbiesCount?.['2']"
      />
    </n-statistic>
    <n-statistic
      :label="'国服'"
      class="flex flex-col justify-center items-center"
    >
      <n-number-animation
        ref="activeLobbiesCounterRef_CN"
        :from="0"
        :to="activeLobbiesCount?.['5']"
      />
    </n-statistic>
  </div>
</template>
