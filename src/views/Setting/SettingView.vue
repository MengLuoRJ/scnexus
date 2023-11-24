<script setup lang="ts">
import { h } from "vue";
import BasicSetting from "@/components/Setting/BasicSetting.vue";
import ProfileSetting from "@/components/Setting/ProfileSetting.vue";
import ServiceLinks from "@/components/Setting/ServiceLinks.vue";
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
  </div>
</template>
