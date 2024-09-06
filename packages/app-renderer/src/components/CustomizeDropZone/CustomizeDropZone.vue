<script setup lang="ts">
import { ref, h, provide, reactive } from "vue";
import { set, useDropZone } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { useDialog, useNotification } from "naive-ui";

import { useProfileStore } from "@/stores/profile";
import { ipcCustomize } from "@/apis/ipcs/customize";
import { ipcDialog } from "@/apis/ipcs/dialog";
import { CompressFileInfo } from "@scnexus/app-shared/types/customize.type";
import { webUtils } from "@/apis/web-utils";

import GameProfileChecker from "@/components/GameProfileChecker.vue";
import ProcessFileModal from "./components/ProcessFileModal.vue";

import { KEY_CFI, KEY_FILEPATH } from "./symbol";

const { t } = useI18n();
const dialog = useDialog();
const profileStore = useProfileStore();

const refDropZone = ref<HTMLDivElement>();
const refProcessFileModal = ref<InstanceType<typeof ProcessFileModal> | null>();

const { isOverDropZone } = useDropZone(refDropZone, onDrop);

const file_path = ref<string>("");
provide(KEY_FILEPATH, file_path);

const cfi = ref<CompressFileInfo | undefined>(undefined);
provide(KEY_CFI, cfi);

async function onDrop(files: File[] | null) {
  if (!profileStore.SUCCESS) {
    return;
  }
  if (!files?.[0]) {
    return;
  }
  const filePath = webUtils.getPathForFile(files?.[0]);
  if (!filePath) return;
  await processFile(filePath);
}

async function onClick() {
  if (!profileStore.SUCCESS) {
    return;
  }

  const { data } = await ipcDialog.showOpenDialog({
    title: t("customize.drop-zone.select-file-title"),
    properties: ["openFile"],
    filters: [
      { name: "SCNexus Compressed File", extensions: ["zip"] },
      { name: "CCM Compressed File", extensions: ["zip"] },
      { name: "ZIP Compressed File", extensions: ["zip"] },
    ],
  });
  if (!data) return;

  const { filePaths, canceled } = data;
  if (canceled || !filePaths) return;

  processFile(filePaths[0]);
}

async function processFile(path: string) {
  const { data, error } = await ipcCustomize.readCompressFileInfo7z(path);
  if (error) {
    console.error(error);
    return;
  }
  if (!data) {
    dialog.error({
      title: t("customize.drop-zone.process-dialog.cfi-error-title"),
      content: t("customize.drop-zone.process-dialog.cfi-error-message"),
    });
    return;
  }
  set(file_path, path);
  set(cfi, data);
  refProcessFileModal.value?.open();
}
</script>

<template>
  <div class="w-full h-full">
    <div
      class="cell-hoverable py-3 bg-gray-100 cursor-pointer"
      ref="refDropZone"
      @click="onClick"
      v-if="profileStore.SUCCESS"
    >
      <div class="w-full h-8 flex flex-col justify-center items-center gap-y-2">
        <div
          v-if="!isOverDropZone"
          class="flex flex-row justify-center items-center gap-6"
        >
          <div class="i-tabler:file-zip h-9 w-9"></div>
          <div class="flex flex-col justify-center items-start gap-y-1">
            <div class="text-xs text-gray-600">
              {{ $t("customize.drop-zone.tip") }}
            </div>
            <div class="text-xs text-gray-500">
              {{ $t("customize.drop-zone.tip-extension") }}
            </div>
          </div>
        </div>
        <div
          v-if="!!isOverDropZone"
          class="flex flex-row justify-center items-center gap-6"
        >
          <div class="i-tabler:file-download h-9 w-9"></div>
          <div class="text-xs text-gray-500">
            {{ $t("customize.drop-zone.tip-release") }}
          </div>
        </div>
      </div>
    </div>
    <GameProfileChecker v-else />
    <ProcessFileModal ref="refProcessFileModal" />
  </div>
</template>
