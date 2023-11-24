<script setup lang="ts">
import router from "@/router";
import Banner from "@/assets/images/project-arcade-banner.png";
import LobbiesCounter from "@/components/ProjectArcade/LobbiesCounter.vue";
import LastDayShortDataDisplay from "@/components/ProjectArcade/LastDayShortDataDisplay.vue";
</script>

<template>
  <div class="flex flex-col justify-center items-center gap-2">
    <div class="mt-2 flex flex-row justify-center items-center gap-2">
      <n-image :src="Banner" width="150" preview-disabled class="hero-logo" />
      <n-divider vertical :style="{ width: '2px', height: '35px' }" />
      <div class="flex flex-col justify-center items-center">
        <div class="hero-title text-2xl">{{ "大厅计划" }}</div>
        <div class="hero-title text-base">
          {{ "PROJECT ARCADE" }}
        </div>
      </div>
    </div>
    <!-- <n-divider :style="{ margin: '0px', width: '75px' }" /> -->
    <!-- <div class="mt-2 flex flex-col justify-center items-center gap-1">
      <div>{{ "「大厅计划（Project Arcade）」" }}</div>
      <div>{{ "致力于为《星际争霸II》玩家提供丰富的游戏资讯与大厅动态" }}</div>
      <div>{{ "并为内容作者提供更好的支持服务" }}</div>
    </div>
    <n-divider :style="{ margin: '0px', width: '75px' }" /> -->
    <div class="mt-10 flex flex-col justify-center items-center">
      <div>{{ "游戏大厅实时房间" }}</div>
      <LobbiesCounter />
    </div>
    <n-divider :style="{ margin: '0px', width: '75px' }" />
    <div class="mt-2 flex flex-col justify-center items-center">
      <div>{{ "游戏大厅活跃数据" }}</div>
      <LastDayShortDataDisplay />
    </div>
    <div class="mt-16 flex flex-col justify-center items-center">
      <div class="text-sm text-gray-400">{{ "数据来源：SC2ARCADE" }}</div>
    </div>
  </div>
</template>

<style scoped>
.hero-title {
  font-weight: bolder;
  background: linear-gradient(
      217deg,
      rgba(40, 0, 241, 0.8),
      rgba(255, 0, 0, 0) 70.71%
    ),
    linear-gradient(
      127deg,
      rgba(180, 0, 245, 0.8),
      rgba(241, 82, 146, 0.947) 70.71%
    ),
    linear-gradient(
      336deg,
      rgba(17, 171, 222, 0.823),
      rgba(0, 0, 255, 0) 70.71%
    );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
