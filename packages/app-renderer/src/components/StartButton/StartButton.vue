<script lang="ts" setup>
import { GameExcutableParameters } from "@scnexus/app-shared/types/customize/client-launcher.type";

const props = defineProps<{
  mode?: "campaign" | "customize";
}>();

const executableParameters: GameExcutableParameters = {
  run: 'start',
};
</script>
<template>
  <div class="start-button flex flex-row justify-center items-center">
    <div class="starter flex flex-row justify-center items-center">
      <div class="i-tabler:player-play w-[18px] h-[18px] mr-[5px]"></div>
      <div>{{ $t("campaign.detail-mode.play") }}</div>
    </div>
    <n-popover trigger="click" :placement="'right-end'">
      <template #trigger>
        <div class="setting group flex flex-row justify-center items-center">
          <div
            class="i-tabler:settings w-[16px] h-[16px] group-hover:animate-spin"
          ></div>
        </div>
      </template>
    </n-popover>
  </div>
</template>
<style scoped>
.start-button {
  @apply h-[40px] text-[16px] text-white leading-[16px];
  @apply rounded bg-[#18a058];
  @apply cursor-pointer;
}

.start-button .starter {
  @apply h-full px-[10px] rounded-l;
  @apply hover:bg-[#36ad6a] transition-all duration-300;
}

.start-button .setting {
  @apply h-full px-[3px] rounded-r;
  @apply border-l-solid b-white b-l-[0.1px];
  @apply hover:bg-[#36ad6a] transition-all duration-300;
}
</style>
