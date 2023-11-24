<script setup lang="ts">
import { set } from "@vueuse/core";
import { useMessage } from "naive-ui";
import { onMounted, onUnmounted, ref } from "vue";

const message = useMessage();

const version = ref<string>("");

const checking = ref<boolean>(false);
const updateAvailable = ref<boolean>(false);

const updateInfo = ref({
  version: "",
  releaseName: "",
  releaseNotes: "",
  releaseDate: "",
});

const downloadProgress = ref({
  percent: 0,
  delta: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
});

const downloading = ref<boolean>(false);
const downloaded = ref<boolean>(false);

async function checkUpdates() {
  await window.ipcRenderer.invoke("updater::check-for-updates");
}

async function downloadUpdates() {
  set(downloading, true);
  await window.ipcRenderer.invoke("updater::download-update");
}

async function installUpdates() {
  await window.ipcRenderer.invoke("updater::quit-and-install");
}

function loadingStatusCheck() {
  window.ipcRenderer.updater.onCheckingForUpdate(() => {
    set(checking, true);
    set(updateAvailable, false);
  });
  window.ipcRenderer.updater.onUpdateNotAvailable(() => {
    set(checking, false);
    set(updateAvailable, false);
  });
  window.ipcRenderer.updater.onUpdateAvailable((_, info) => {
    set(updateInfo, info);
    set(checking, false);
    set(updateAvailable, true);
  });
}

function downloadingStatusCheck() {
  window.ipcRenderer.updater.onDownloadProgress((_, progress) => {
    set(downloadProgress, progress);
  });
  window.ipcRenderer.updater.onUpdateDownloaded(() => {
    set(downloaded, true);
    set(downloading, false);
  });
}

function catchUpdaterError() {
  window.ipcRenderer.updater.onError((_, error) => {
    message.error(error.message);
    console.error(error);
  });
}

async function getAppVersion() {
  const ver = await window.ipcRenderer.invoke("app::get-version");
  set(version, ("v" + ver) as string);
}

onMounted(async () => {
  await getAppVersion();
  loadingStatusCheck();
  downloadingStatusCheck();
  catchUpdaterError();
});

onUnmounted(() => {
  window.ipcRenderer.updater.clear();
});
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
        v-model:value="version"
        readonly
      />
    </n-form-item>
    <n-button
      v-if="!updateAvailable"
      size="small"
      @click="checkUpdates()"
      :loading="checking"
    >
      {{ "检查更新" }}
    </n-button>
    <n-button
      v-if="updateAvailable && !downloaded"
      size="small"
      type="primary"
      @click="downloadUpdates()"
      :loading="downloading"
    >
      {{ "更新" }}
    </n-button>
    <n-button
      v-if="downloaded"
      size="small"
      type="primary"
      @click="installUpdates()"
    >
      {{ "安装" }}
    </n-button>
    <div class="flex flex-col gap-1">
      <div
        v-if="updateAvailable && !downloaded"
        class="ml-2 text-sm text-blue-500"
      >
        {{ "新版本可用：v" + updateInfo.version }}
      </div>
      <div
        v-if="updateAvailable && downloading"
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
