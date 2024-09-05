<script setup lang="ts">
import router from "@/router";
import { storeToRefs } from "pinia";
import { useUploadCustomizeStore } from "@/stores/upload-customize";

import CreatorUploaderDropZone from "./components/CreatorUploaderDropZone.vue";
import CreatorUploaderFrom from "./components/CreatorUploaderForm.vue";
import CreatorUploaderProcesser from "./components/CreatorUploaderProcesser.vue";

const uploadCustomizeStore = useUploadCustomizeStore();

const { uploader_step, file_path, upload_url, upload_ref, upload_data } =
  storeToRefs(uploadCustomizeStore);
</script>

<template>
  <div class="creator-uploader">
    <div class="text-lg flex flex-row justify-start items-center gap-1">
      <div class="header text-lg">
        {{ "创作服务" }}
      </div>
      <div>{{ " / " }}</div>
      <div>{{ "作品上传" }}</div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <CreatorUploaderDropZone v-if="uploader_step === 'pending'" />
    <CreatorUploaderFrom v-if="uploader_step === 'editing'" />
    <CreatorUploaderProcesser v-if="uploader_step === 'filing'" />
    <div
      v-if="uploader_step === 'finished'"
      class="flex flex-col justify-start gap-1"
    >
      <n-result status="success" title="作品上传成功">
        <template #footer>
          <n-button type="primary" @click="router.push('/creator')">
            {{ "返回创作服务" }}
          </n-button>
          <n-button type="info">{{ "查看作品" }}</n-button>
          <n-button type="info" @click="uploadCustomizeStore.clean">
            {{ "上传新作品" }}
          </n-button>
        </template>
      </n-result>
    </div>
  </div>
</template>
