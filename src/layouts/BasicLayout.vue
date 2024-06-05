<script lang="ts" setup>
import { ref } from "vue";
import BaseSideMenu from "./components/BaseSideMenu.vue";
import BasePageContent from "./components/BasePageContent.vue";

import MenuSetting from "@/assets/menu/Menu_Setting.png";

import DefaultAvatar from "@/assets/images/avatar-00.jpg";

const collapsed = ref(true);
</script>

<template>
  <n-layout
    class="layout flex flex-auto flex-row bg-gray-200"
    :position="'absolute'"
    has-sider
  >
    <n-layout-sider
      class="layout-sider my-2 ml-2 shadow rounded-2 relative z-10 transition-all duration-300 ease-in-out"
      bordered
      :show-trigger="true"
      collapse-mode="width"
      @collapse="collapsed = true"
      @expand="collapsed = false"
      :collapsed="collapsed"
      :position="'static'"
      :width="128"
      :collapsed-width="48"
      :native-scrollbar="false"
      :content-style="{
        height: 'calc(100vh - 1rem)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'start',
      }"
    >
      <BaseSideMenu v-model:collapsed="collapsed" />
      <div
        class="self-center mt-auto mb-2 flex flex-col justify-center items-center gap-2"
      >
        <div class="menu-icon" @click="$router.push('/setting')">
          <n-image :src="MenuSetting" width="32" height="32" previewDisabled />
        </div>
        <n-divider
          :style="{
            marginTop: '2px',
            marginBottom: '2px',
            marginLeft: '0px',
            marginRight: '0px',
          }"
        />
        <n-avatar
          class="cursor-pointer hover:shadow-lg"
          round
          size="medium"
          :src="DefaultAvatar"
          @click="$router.push('/user')"
        />
      </div>
    </n-layout-sider>
    <n-layout
      class="layout-main bg-gray-200"
      :native-scrollbar="false"
      :scrollbar-props="{}"
    >
      <n-layout-header class="layout-header z-[10]" :position="'absolute'">
      </n-layout-header>
      <n-layout-content
        class="layout-content flex-auto min-h-[97vh] m-2 rounded-2"
      >
        <div class="layout-content-container">
          <div class="layout-content-main relative mx-6 my-6">
            <BasePageContent />
          </div>
        </div>
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<style>
.menu-icon {
  @apply w-[32px] h-[32px] cursor-pointer hover:drop-shadow-lg;
}
</style>
