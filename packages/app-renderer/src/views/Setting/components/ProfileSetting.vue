<script setup lang="ts">
import { useProfileStore } from "@/stores/profile";
import { storeToRefs } from "pinia";

import IconTooltip from "@/components/IconTooltip.vue";
import { ipcDialog } from "@/apis/ipcs/dialog";

const profileStore = useProfileStore();
const {
  SUCCESS,
  ERROR_MESSAGE,
  PROFILE_GAME,
  PROFILE_DOCUMENTS,
  PROFILE_CAMPAIGN,
  PROFILE_CUSTOMIZE,
} = storeToRefs(profileStore);

async function hookupPathSelector(autodetect?: boolean) {
  if (!!autodetect) {
    await profileStore.initProfile();
  } else {
    const { data: path } = await ipcDialog.showOpenDialogSync({
      title: "选择游戏根目录",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (path) {
      await profileStore.initProfile(path[0]);
    }
  }
}
</script>
<template>
  <div class="profile-setting flex flex-col justify-center gap-2">
    <div class="flex flex-row justify-start items-center gap-1">
      <div>{{ "游戏设置完整性：" }}</div>
      <n-badge
        :type="SUCCESS ? 'success' : 'warning'"
        :value="SUCCESS ? '已成功设置' : ERROR_MESSAGE"
        processing
      >
      </n-badge>
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
          <n-button class="mr-1" size="small" @click="hookupPathSelector(true)">
            {{ "自动检测" }}
          </n-button>
        </template>
        <div class="text-xs">{{ "根据系统注册表自动获取游戏根目录" }}</div>
      </n-popover>
    </div>
    <div
      v-if="!!profileStore?.SUCCESS"
      class="flex flex-col justify-center gap-2"
    >
      <n-divider :style="{ margin: '0.5px 0px 0.5px 0px' }"></n-divider>
      <n-form-item size="small" :show-feedback="false">
        <template #label>
          <div class="flex flex-row justify-start items-center gap-1">
            <div class="text-sm">{{ "游戏根目录" }}</div>
            <IconTooltip :tooltip="'《星际争霸II》游戏根目录。'" />
          </div>
        </template>
        <n-input
          class="mx-0.5"
          v-model:value="PROFILE_GAME!.GAME_ROOT"
          readonly
        />
      </n-form-item>
      <div class="cell-normal flex flex-col justify-center gap-1">
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "战役包管理目录" }}</div>
              <IconTooltip
                :tooltip="'「星际枢纽」用于管理战役包文件的目录。'"
              />
            </div>
          </template>
          <n-input v-model:value="PROFILE_CAMPAIGN!.LIBRARY_ROOT" readonly />
        </n-form-item>
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "自定义作品管理目录" }}</div>
              <IconTooltip
                :tooltip="'「星际枢纽」用于管理自定义作品文件的目录。'"
              />
            </div>
          </template>
          <n-input v-model:value="PROFILE_CUSTOMIZE!.LIBRARY_ROOT" readonly />
        </n-form-item>
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "CCM 战役包管理目录" }}</div>
              <IconTooltip
                :tooltip="'「星际枢纽」用于管理 CCM 格式战役包文件的目录，同时也是 CCM 管理器管理的目录。'"
              />
            </div>
          </template>
          <n-input v-model:value="PROFILE_CAMPAIGN!.CCM_ROOT" readonly />
        </n-form-item>
      </div>
      <n-divider :style="{ margin: '0px' }"></n-divider>
      <n-form-item size="small" :show-feedback="false">
        <template #label>
          <div class="flex flex-row justify-start items-center gap-1">
            <div class="text-sm">{{ "游戏文档根目录" }}</div>
            <IconTooltip
              :tooltip="'《星际争霸II》游戏配置、存档、录像等文档的根目录。'"
            />
          </div>
        </template>
        <n-input
          class="mx-0.5"
          v-model:value="PROFILE_DOCUMENTS!.DOCUMENTS_ROOT"
          readonly
        />
      </n-form-item>
      <div class="cell-normal flex flex-col justify-center gap-1">
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "大厅存档文档目录" }}</div>
              <IconTooltip :tooltip="'《星际争霸II》大厅自定义游戏存档目录'" />
            </div>
          </template>
          <n-input
            v-model:value="PROFILE_DOCUMENTS!.DOCUMENTS_ARCADE_BANKS_ROOT"
            readonly
          />
        </n-form-item>
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "本地存档文档目录" }}</div>
              <IconTooltip :tooltip="'《星际争霸II》本地游戏存档目录'" />
            </div>
          </template>
          <n-input
            v-model:value="PROFILE_DOCUMENTS!.DOCUMENTS_LOCAL_BANKS_ROOT"
            readonly
          />
        </n-form-item>
      </div>
    </div>
  </div>
</template>
