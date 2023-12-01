<script setup lang="ts">
import { showOpenDialogSync } from "@/composables/useIpcHost/useDialogIpc";
import { useLocalProfileStore } from "@/stores/local-profile";
import { storeToRefs } from "pinia";

const localProfileStore = useLocalProfileStore();
const { SUCCESS, ERROR_MESSAGE } = storeToRefs(localProfileStore);

async function hookupPathSelector(autodetect?: boolean) {
  if (!!autodetect) {
    await localProfileStore.initProfile();
  } else {
    const path = await showOpenDialogSync({
      title: "选择游戏根目录",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (path) {
      await localProfileStore.initProfile(path[0]);
    }
  }
}
</script>
<template>
  <n-alert
    :type="SUCCESS ? 'success' : 'warning'"
    :title="SUCCESS ? '已成功设置' : '游戏尚未成功设置'"
  >
    <div class="flex flex-col justify-center gap-1">
      <div>
        {{ SUCCESS ? "已成功设置" : ERROR_MESSAGE }}
      </div>
      <div class="ml--1 flex flex-row justify-start items-center gap-1">
        <n-popover trigger="hover" style="max-width: 200px" :show-arrow="false">
          <template #trigger>
            <n-button class="ml-1" size="small" @click="hookupPathSelector()">
              {{ "手动设置" }}
            </n-button>
          </template>
          <div class="text-xs">{{ "手动选择游戏根目录" }}</div>
        </n-popover>
        <n-popover trigger="hover" style="max-width: 200px" :show-arrow="false">
          <template #trigger>
            <n-button
              class="mr-1"
              size="small"
              @click="hookupPathSelector(true)"
            >
              {{ "自动检测" }}
            </n-button>
          </template>
          <div class="text-xs">{{ "根据系统注册表自动获取游戏根目录" }}</div>
        </n-popover>
      </div>
    </div>
  </n-alert>
</template>
