<script setup lang="ts">
import {
  metadataTypes,
  metadataCampaignTypes,
  syncMetadata,
} from "@/views/Creator/composables/useWorkshopUploaderService";
import { useUploadCustomizeStore } from "@/stores/upload-customize";
import { set } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";
import { ref } from "vue";

const uploadCustomizeStore = useUploadCustomizeStore();

const { uploader_step, uploader_type, upload_ref, upload_data } =
  storeToRefs(uploadCustomizeStore);

const dataVersion = ref([0, 0, 1]);
const updateDataVersion = () => {
  upload_data.value.version = `${dataVersion.value[0]}.${dataVersion.value[1]}.${dataVersion.value[2]}`;
};
const formRules = ref({});

onMounted(() => {
  set(
    dataVersion,
    upload_data.value.version.split(".").map((item) => Number(item))
  );
});
</script>
<template>
  <div class="flex flex-col justify-start gap-1">
    <div>{{ "确认作品详细信息" }}</div>
    <div class="cell-normal my-2">
      <n-form
        class="pt-2"
        ref="upload_ref"
        :model="upload_data"
        :rules="formRules"
        size="small"
        label-placement="left"
        label-width="auto"
        require-mark-placement="right-hanging"
        :show-feedback="true"
      >
        <n-form-item label="作品名称" path="name">
          <n-input
            v-model:value="upload_data.name"
            placeholder="作品名称"
            show-count
          />
        </n-form-item>
        <n-form-item label="作品作者" path="author">
          <n-input
            v-model:value="upload_data.author"
            placeholder="作品作者"
            show-count
          />
        </n-form-item>
        <n-form-item label="作品描述" path="description">
          <n-input
            v-model:value="upload_data.description"
            placeholder="Textarea"
            type="textarea"
            :autosize="{
              minRows: 3,
              maxRows: 5,
            }"
            show-count
          />
        </n-form-item>
        <n-form-item label="作品标签" path="tags">
          <n-dynamic-tags v-model:value="upload_data.tags" />
        </n-form-item>
        <n-form-item label="作品版本" path="version">
          <div class="flex flex-row justify-start items-center">
            <div class="mr-6">{{ "v" + upload_data.version }}</div>
            <n-input-number
              class="w-[90px]"
              v-model:value="dataVersion[0]"
              min="0"
              @update:value="updateDataVersion"
            />
            <n-input-number
              class="w-[90px]"
              v-model:value="dataVersion[1]"
              min="0"
              @update:value="updateDataVersion"
            />
            <n-input-number
              class="w-[90px]"
              v-model:value="dataVersion[2]"
              min="1"
              @update:value="updateDataVersion"
            />
          </div>
        </n-form-item>
        <n-form-item label="作品类型" path="type">
          <n-radio-group v-model:value="upload_data.type" name="type">
            <n-space>
              <n-radio
                v-for="(type, index) in metadataTypes"
                :key="type.value"
                :value="type.value"
              >
                {{ type.label }}
              </n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>
        <n-form-item
          label="作品战役"
          path="campaign_type"
          v-if="upload_data.type === 'Campaign'"
        >
          <n-radio-group
            v-model:value="upload_data.campaign"
            name="campaign_type"
          >
            <n-space>
              <n-radio
                v-for="(type, index) in metadataCampaignTypes"
                :key="type.value"
                :value="type.value"
              >
                {{ type.label }}
              </n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>
      </n-form>
    </div>
    <div class="flex flex-row justify-start items-center gap-2">
      <n-button type="primary" @click="" v-if="uploader_step === 'generater'">
        {{ "保存至文件" }}
      </n-button>
      <n-button
        type="primary"
        @click="uploader_step = 'filing'"
        v-if="uploader_step === 'editing'"
      >
        {{ "提交" }}
      </n-button>
      <n-button
        type="info"
        @click="syncMetadata"
        v-if="uploader_step === 'editing'"
      >
        {{ "将修改同步至文件" }}
      </n-button>
      <n-button type="warning" @click="uploadCustomizeStore.clean">
        {{ "取消" }}
      </n-button>
    </div>
  </div>
</template>
