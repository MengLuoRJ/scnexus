<script setup lang="ts">
import { showOpenDialogSync } from "@/composables/useIpcHost/useDialogIpc";
import {
  getProfile,
  initProfile,
} from "@/composables/useIpcHost/useSettingIpc";
import { emiiterEmit, emiiterOff, emiiterOn } from "@/composables/useMitt";
import { LocalProfile } from "@shared/types/profile";
import { get, set } from "@vueuse/core";
import { onMounted, ref, h } from "vue";

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
  if (get(settingProfile)?.SUCCESS) {
    emiiterEmit("customize-profile-changed");
  }
}

async function getLocalProfile() {
  const profile = await getProfile();
  set(settingProfile, profile);
}

onMounted(async () => {
  await getLocalProfile();
});
</script>
<template>
  <n-alert
    :type="settingProfile?.SUCCESS ? 'success' : 'warning'"
    :title="settingProfile?.SUCCESS ? '已成功设置' : '游戏尚未成功设置'"
  >
    <div class="flex flex-col justify-center gap-1">
      <div>
        {{
          settingProfile?.SUCCESS ? "已成功设置" : settingProfile?.ERROR_MESSAGE
        }}
      </div>
      <div class="ml--1 flex flex-row justify-start items-center gap-1">
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
            <n-button
              class="mr-1"
              size="small"
              @click="hookupPathSelector(true)"
            >
              {{ "自动检测" }}
            </n-button>
          </template>
          <div class="text-xs">{{ "111" }}</div>
        </n-popover>
      </div>
    </div>
  </n-alert>
</template>
@/composables/useIpcHost/useDialogService@/composables/useIpcHost/useSettingService