<script setup lang="ts">
import {
  getProfile,
  initProfile,
} from "@/composables/useIpcHost/useSettingIpc";
import { LocalProfile } from "@shared/types/profile";
import { set } from "@vueuse/core";
import { onMounted, ref, h } from "vue";
import IconTooltip from "../IconTooltip.vue";
import { showOpenDialogSync } from "@/composables/useIpcHost/useDialogIpc";

const settingProfile = ref<LocalProfile>();

async function hookupPathSelector(autodetect?: boolean) {
  if (!!autodetect) {
    const profile = await initProfile();
    set(settingProfile, profile);
  } else {
    const path = await showOpenDialogSync({
      title: "选择游戏根目录",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (!path) {
    }
    const profile = await initProfile(path[0]);
    set(settingProfile, profile);
  }
}

async function getLocalProfile() {
  const profile = await getProfile();
  console.log(profile);
  set(settingProfile, profile);
}

onMounted(async () => {
  await getLocalProfile();
});
</script>
<template>
  <div class="profile-setting flex flex-col justify-center gap-2">
    <div class="flex flex-row justify-start items-center gap-1">
      <div>{{ "游戏设置完整性：" }}</div>
      <n-badge
        :type="settingProfile?.SUCCESS ? 'success' : 'warning'"
        :value="
          settingProfile?.SUCCESS ? '已成功设置' : settingProfile?.ERROR_MESSAGE
        "
        processing
      >
      </n-badge>
      <n-popover trigger="hover" style="max-width: 200px" :show-arrow="false">
        <template #trigger>
          <n-button class="ml-1" size="small" @click="hookupPathSelector()">
            {{ "手动设置" }}
          </n-button>
        </template>
        <div class="text-xs">{{ "111" }}</div>
      </n-popover>
      <n-popover trigger="hover" style="max-width: 200px" :show-arrow="false">
        <template #trigger>
          <n-button class="mr-1" size="small" @click="hookupPathSelector(true)">
            {{ "自动检测" }}
          </n-button>
        </template>
        <div class="text-xs">{{ "111" }}</div>
      </n-popover>
    </div>
    <div
      v-if="!!settingProfile?.SUCCESS"
      class="flex flex-col justify-center gap-2"
    >
      <n-divider :style="{ margin: '0.5px 0px 0.5px 0px' }"></n-divider>
      <n-form-item size="small" :show-feedback="false">
        <template #label>
          <div class="flex flex-row justify-start items-center gap-1">
            <div class="text-sm">{{ "游戏根目录" }}</div>
            <IconTooltip :tooltip="'111'" />
          </div>
        </template>
        <n-input
          class="mx-0.5"
          v-model:value="settingProfile.PROFILE_GAME.GAME_ROOT"
          readonly
        />
      </n-form-item>
      <div class="cell-normal flex flex-col justify-center gap-1">
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "战役包管理目录" }}</div>
              <IconTooltip :tooltip="'111'" />
            </div>
          </template>
          <n-input
            v-model:value="settingProfile.PROFILE_CAMPAIGN.LIBRARY_ROOT"
            readonly
          />
        </n-form-item>
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "自定义作品管理目录" }}</div>
              <IconTooltip :tooltip="'111'" />
            </div>
          </template>
          <n-input
            v-model:value="settingProfile.PROFILE_CUSTOMIZE.LIBRARY_ROOT"
            readonly
          />
        </n-form-item>
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "CCM 战役包管理目录" }}</div>
              <IconTooltip :tooltip="'111'" />
            </div>
          </template>
          <n-input
            v-model:value="settingProfile.PROFILE_CAMPAIGN.CCM_ROOT"
            readonly
          />
        </n-form-item>
      </div>
      <n-divider :style="{ margin: '0px' }"></n-divider>
      <n-form-item size="small" :show-feedback="false">
        <template #label>
          <div class="flex flex-row justify-start items-center gap-1">
            <div class="text-sm">{{ "游戏文档根目录" }}</div>
            <IconTooltip :tooltip="'111'" />
          </div>
        </template>
        <n-input
          class="mx-0.5"
          v-model:value="settingProfile.PROFILE_DOCUMENTS.DOCUMENTS_ROOT"
          readonly
        />
      </n-form-item>
      <div class="cell-normal flex flex-col justify-center gap-1">
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "大厅存档文档目录" }}</div>
              <IconTooltip :tooltip="'111'" />
            </div>
          </template>
          <n-input
            v-model:value="
              settingProfile.PROFILE_DOCUMENTS.DOCUMENTS_ARCADE_BANKS_ROOT
            "
            readonly
          />
        </n-form-item>
        <n-form-item size="small" label-placement="left" :show-feedback="false">
          <template #label>
            <div class="flex flex-row justify-start items-center gap-1">
              <div>{{ "本地存档文档目录" }}</div>
              <IconTooltip :tooltip="'111'" />
            </div>
          </template>
          <n-input
            v-model:value="
              settingProfile.PROFILE_DOCUMENTS.DOCUMENTS_LOCAL_BANKS_ROOT
            "
            readonly
          />
        </n-form-item>
      </div>
    </div>
  </div>
</template>

<style scoped>
.path-input {
  appearance: none;
  height: 24px;
  text-indent: 6px;
  --at-apply: border rounded-1 border-gray-200;
  &:hover {
    --at-apply: border-green-200;
  }
  &:focus {
    --at-apply: border-green-300 outline-green-300;
  }
}
</style>
@/composables/useIpcHost/useSettingService@/composables/useIpcHost/useDialogService