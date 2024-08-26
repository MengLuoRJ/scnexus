<script setup lang="ts">
import { useFetch } from "@/composables/useFetch";
import { onMounted, ref } from "vue";
import router from "@/router";
import { useUserStore } from "@/stores/user";
import { get, set } from "@vueuse/core";
import { useCreatorStore } from "@/stores/creator";
import { storeToRefs } from "pinia";

const userStore = useUserStore();

const creatorStore = useCreatorStore();
const { profile } = storeToRefs(creatorStore);

async function requestCreatorData() {
  const { data, error } = await useFetch("/creator/user/" + userStore.uuid)
    .get()
    .json();
  if (get(error)) {
    console.warn(error);
  }
  if (get(data)) {
    set(profile, get(data));
  }
}

onMounted(async () => {
  if (userStore.roles.includes("creator")) {
    await requestCreatorData();
  } else {
    // @TODO
    return;
  }
});
</script>

<template>
  <div class="creator">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">
        {{ "创作服务" }}
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div class="cell-normal flex flex-row justify-center items-center gap-2">
      <div class="basis-1/2 flex flex-col justify-start items-center">
        <div class="text-sm text-gray">{{ "欢迎您，创作者" }}</div>
        <div class="text-base">{{ profile.name }}</div>
        <div class="text-sm text-gray">{{ profile.description }}</div>
      </div>
      <div class="basis-1/2 flex flex-col justify-start items-center">
        <div>
          <span>{{ "创作者状态：" }}</span>
          <span>{{ profile.is_banned ? "封禁中" : "正常" }}</span>
        </div>
        <div>
          {{
            "创意工坊存储空间：" +
            profile.capacity_used +
            " / " +
            profile.capacity_total
          }}
        </div>
        <div class="w-[150px]">
          <n-progress
            type="line"
            :percentage="profile.capacity_used / profile.capacity_total"
            :indicator-placement="'inside'"
          />
        </div>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div class="flex flex-row justify-center items-center gap-2 mt-2">
      <n-button
        size="medium"
        type="info"
        class=""
        @click="router.push('/creator/uploader')"
      >
        {{ "上传作品" }}
        <template #icon>
          <n-icon>
            <div class="i-tabler:upload"></div>
          </n-icon>
        </template>
      </n-button>
      <n-button size="medium" type="info" class="" @click="router.push('/creator/manage')">
        {{ "管理作品" }}
        <template #icon>
          <n-icon>
            <div class="i-tabler:file-zip"></div>
          </n-icon>
        </template>
      </n-button>
      <n-button size="medium" type="info" class="" disabled>
        {{ "数据中心" }}
        <template #icon>
          <n-icon>
            <div class="i-tabler:device-analytics"></div>
          </n-icon>
        </template>
      </n-button>
      <n-button size="medium" type="info" class="" disabled>
        {{ "互动管理" }}
        <template #icon>
          <n-icon>
            <div class="i-tabler:message-cog"></div>
          </n-icon>
        </template>
      </n-button>
    </div>
  </div>
</template>
