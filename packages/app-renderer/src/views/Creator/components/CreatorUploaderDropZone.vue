<script setup lang="ts">
import { ipcDialog } from "@/apis/ipcs/dialog";
import {
  initUploader,
  readCompressFile,
} from "@/views/Creator/composables/useWorkshopUploaderService";
import { useUploadCustomizeStore } from "@/stores/upload-customize";
import { useDropZone } from "@vueuse/core";
import { ref } from "vue";

const uploadCustomizeStore = useUploadCustomizeStore();

const dropZoneRef = ref<HTMLDivElement>();
const { isOverDropZone } = useDropZone(dropZoneRef, onDrop);

async function onDrop(files: File[] | null) {
  await processFile(files?.[0].path!);
}

async function onClick() {
  const { data } = await ipcDialog.showOpenDialog({
    title: "选择将要上传的压缩包文件",
    properties: ["openFile"],
    filters: [{ name: "星际枢纽压缩包", extensions: ["zip"] }],
  });

  if (!data) return;

  const { filePaths, canceled } = data;

  if (canceled || !filePaths) return;

  processFile(filePaths[0]);
}

async function processFile(path: string) {
  const result = await readCompressFile(path);
  if (result) {
    uploadCustomizeStore.setFilePath(path);
    uploadCustomizeStore.updateData(result);
    initUploader();
  }
}
</script>
<template>
  <div class="flex flex-col justify-start gap-2">
    <div class="cell-hoverable py-3 bg-gray-100/50" ref="dropZoneRef">
      <div class="flex flex-col justify-center items-center gap-y-1">
        <div class="i-tabler:upload h-9 w-9"></div>
        <div v-if="!isOverDropZone" class="text-gray-600">
          {{ "可将文件拖动至此以开始上传流程" }}
        </div>
        <div v-if="!!isOverDropZone" class="text-gray-600">
          {{ "松开鼠标释放文件以开始上传流程" }}
        </div>
        <n-button type="info" @click="onClick">
          {{ "选择上传文件" }}
          <template #icon>
            <n-icon>
              <div class="i-tabler:upload"></div>
            </n-icon>
          </template>
        </n-button>
        <div class="text-gray-500">
          {{ $t("customize.drop-zone.tip-extension") }}
        </div>
      </div>
    </div>
    <div class="self-center">
      <span class="text-gray-600">
        {{ "上传作品，即代表您已知晓且同意" }}
      </span>
      <span>
        {{ "「星际枢纽」创意工坊使用协议" }}
      </span>
    </div>
    <div class="self-center text-gray-600">
      {{ "请勿上传任何色情、反动等违规违法作品" }}
    </div>
  </div>
</template>
