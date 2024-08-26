<script setup lang="ts">
import router from "@/router";
</script>
<template>
  <div class="page-worshop">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">
        {{ "创意工坊" }}
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div
      @click="router.push('/workshop/campaign')"
      class="flex flex-row justify-around items-center gap-2"
    >
      <div
        class="basis-1/2 cell-normal px-10 py-2 group hover:shadow-lg cursor-pointer flex flex-row justify-center items-center gap-2"
      >
        <span class="w-[28px] h-[28px] i-tabler:settings-automation"></span>
        <span class="text-base">{{ "战役包作品" }}</span>
      </div>
      <div
        @click="router.push('/workshop/customize')"
        class="basis-1/2 cell-normal px-10 py-2 hover:shadow-lg cursor-pointer flex flex-row justify-center items-center gap-2"
      >
        <span class="w-[28px] h-[28px] i-tabler:settings-automation"></span>
        <span class="text-base">{{ "自定义作品" }}</span>
      </div>
    </div>
  </div>
</template>
