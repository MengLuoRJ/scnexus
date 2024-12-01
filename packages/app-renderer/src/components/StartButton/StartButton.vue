<script lang="ts" setup>
import { storeToRefs } from "pinia";
import { usePresetStore } from "@/stores/preset";

import type { GameExecutableParameters } from "@scnexus/app-shared/types/customize/client-launcher.type";
import { computed } from "vue";
import { get, set } from "@vueuse/core";
import { ipcCustomize } from "@/apis/ipcs/customize";

const { play_button_game_mode } = storeToRefs(usePresetStore());

const props = defineProps<{
  type: "campaign" | "customize";
  path_map_file?: string;
  size?: "small" | "large";
}>();

const modeExecutable = computed({
  get() {
    return get(play_button_game_mode) === "executable";
  },
  set(value) {
    set(play_button_game_mode, value ? "executable" : "client");
  },
});

const modeClient = computed({
  get() {
    return get(play_button_game_mode) === "client";
  },
  set(value) {
    set(play_button_game_mode, value ? "client" : "executable");
  },
});

const executableParameters = computed<GameExecutableParameters>(() => {
  return {
    run: props.path_map_file,
  };
});

const handleExecutableStart = async () => {
  await ipcCustomize.runGameExecutable(get(executableParameters));
};

const handleClientStart = async () => {
  await ipcCustomize.runGameClient();
};

const handleDefaultStart = async () => {
  if (get(play_button_game_mode) === "executable") {
    await handleExecutableStart();
  } else if (get(play_button_game_mode) === "client") {
    await handleClientStart();
  }
};
</script>
<template>
  <div
    :class="[
      'start-button flex flex-row justify-center items-center',
      { small: props.size === 'small' },
    ]"
  >
    <div
      class="starter flex flex-row justify-center items-center"
      @click="handleDefaultStart"
    >
      <div class="i-tabler:player-play w-[18px] h-[18px] mr-[5px]"></div>
      <div v-if="props.size === 'small'">
        {{ $t("campaign.brief-mode.play") }}
      </div>
      <div v-else>{{ $t("campaign.detail-mode.play") }}</div>
    </div>
    <n-popover trigger="hover" :placement="'right-end'">
      <template #trigger>
        <div class="setting group flex flex-row justify-center items-center">
          <div
            class="i-tabler:settings w-[16px] h-[16px] group-hover:animate-spin"
          ></div>
        </div>
      </template>
      <div class="options flex flex-col justify-center items-start">
        <n-divider
          :title-placement="'left'"
          :style="{ margin: '2px 0px', fontSize: '12px' }"
        >
          {{ "启动模式" }}
        </n-divider>
        <div class="w-full my-1 flex flex-row justify-start items-center">
          <n-button text size="small" @click="handleClientStart">
            {{ "使用在线战网端启动" }}
          </n-button>
          <div class="ml-2 flex flex-row justify-center items-center gap-1">
            <n-checkbox v-model:checked="modeClient" size="small" />
            <div v-if="modeClient" class="text-gray-500 leading-[14px]">
              {{ "(默认)" }}
            </div>
          </div>
        </div>
        <n-divider :style="{ margin: '2px 0px' }" dashed />
        <div class="w-full my-1 flex flex-row justify-start items-center">
          <n-button text size="small" @click="handleExecutableStart">
            {{ "使用本地客户端启动" }}
          </n-button>
          <div class="ml-2 flex flex-row justify-center items-center gap-1">
            <n-checkbox v-model:checked="modeExecutable" size="small" />
            <div v-if="modeExecutable" class="text-gray-500 leading-[14px]">
              {{ "(默认)" }}
            </div>
          </div>
        </div>
      </div>
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

.start-button.small {
  @apply h-[28px] text-[14px] text-white leading-[16px];
  @apply rounded bg-[#18a058];
  @apply cursor-pointer;
}

.start-button.small .starter {
  @apply h-full px-[10px] rounded-l;
  @apply hover:bg-[#36ad6a] transition-all duration-300;
}

.start-button.small .setting {
  @apply h-full px-[3px] rounded-r;
  @apply border-l-solid b-white b-l-[0.1px];
  @apply hover:bg-[#36ad6a] transition-all duration-300;
}
</style>
