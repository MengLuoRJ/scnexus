<script setup lang="ts">
import { h, onMounted, ref } from "vue";
import { set } from "@vueuse/core";

import BasicSetting from "./components/BasicSetting.vue";
import ProfileSetting from "./components/ProfileSetting.vue";
import ServiceLinks from "./components/ServiceLinks.vue";
import { ipcSetting } from "@/apis/ipcs/setting";

const client_id = ref("");

onMounted(async () => {
  const { data: setting_client_id } = await ipcSetting.getSettingKey(
    "CLIENT_ID"
  );
  set(client_id, setting_client_id);
});
</script>

<template>
  <div class="setting">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">{{ "设置" }}</div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <n-tabs type="line" animated>
      <n-tab-pane
        :name="'client'"
        :tab="
          () =>
            h(
              'div',
              { class: 'flex flex-row justify-start items-center gap-1' },
              '基本设置'
            )
        "
      >
        <BasicSetting />
        <n-divider :style="{ marginTop: '12px', marginBottom: '12px' }" />
        <ServiceLinks />
      </n-tab-pane>
      <n-tab-pane
        :name="'profile'"
        :tab="
          () =>
            h(
              'div',
              { class: 'flex flex-row justify-start items-center gap-1' },
              '游戏设置'
            )
        "
      >
        <ProfileSetting />
      </n-tab-pane>
    </n-tabs>
    <!-- <div class="mt-30vh text-gray-300 mt-10vh">
      <span>{{ "CLIENT ID: " }}</span>
      <span>{{ client_id }}</span>
    </div> -->
  </div>
</template>
