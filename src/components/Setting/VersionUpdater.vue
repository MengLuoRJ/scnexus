<script setup lang="ts">
import {
  checkUpdates,
  downloadUpdates,
  installUpdates,
} from "@/composables/useUpdater";
import { useUpdaterStore } from "@/stores/updater";
import { useMessage } from "naive-ui";
import { storeToRefs } from "pinia";
import { onMounted, onUnmounted, ref } from "vue";

const updaterStore = useUpdaterStore();

const {
  CURRENT_VERSION,
  UPDATE_CHECKING,
  UPDATE_AVAILABLE,
  UPDATE_DOWNLOADING,
  UPDATE_DOWNLOADED,
  updateInfo,
  downloadProgress,
} = storeToRefs(updaterStore);
</script>

<template>
  <div class="flex flex-row items-center gap-1">
    <n-form-item size="small" label-placement="left" :show-feedback="false">
      <template #label>
        <div class="flex flex-row justify-start items-center gap-1">
          <div class="text-sm">{{ "星际枢纽版本" }}</div>
          <IconTooltip :tooltip="'星际枢纽版本'" />
        </div>
      </template>
      <n-input
        :style="{ width: '150px' }"
        class="mx-0.5"
        v-model:value="CURRENT_VERSION"
        readonly
      />
    </n-form-item>
    <n-button
      v-if="!UPDATE_AVAILABLE"
      size="small"
      @click="checkUpdates()"
      :loading="UPDATE_CHECKING"
    >
      {{ "检查更新" }}
    </n-button>
    <n-button
      v-if="UPDATE_AVAILABLE && !UPDATE_DOWNLOADED"
      size="small"
      type="primary"
      @click="downloadUpdates()"
      :loading="UPDATE_DOWNLOADING"
    >
      {{ "更新" }}
    </n-button>
    <n-button
      v-if="UPDATE_DOWNLOADED"
      size="small"
      type="primary"
      @click="installUpdates()"
    >
      {{ "安装" }}
    </n-button>
    <div class="flex flex-col gap-1">
      <div
        v-if="UPDATE_AVAILABLE && !UPDATE_DOWNLOADED"
        class="ml-2 text-sm text-blue-500"
      >
        {{ "新版本可用：" + updateInfo.version }}
      </div>
      <div
        v-if="UPDATE_AVAILABLE && UPDATE_DOWNLOADING"
        class="ml-2 text-sm text-blue-500"
      >
        {{
          `正在下载：${downloadProgress.percent.toFixed(2)}% (${(
            downloadProgress.bytesPerSecond / 1024
          ).toFixed(2)}KB/s)`
        }}
      </div>
    </div>
  </div>
</template>
