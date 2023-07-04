<script lang="ts" setup>
import BaseSideMenu from "@/components/BaseSideMenu.vue";
import BasePageContent from "@/components/BasePageContent.vue";
import { ref } from "vue";

const collapsed = ref(true);
</script>

<template>
  <n-layout
    class="layout flex flex-auto flex-row"
    :position="'absolute'"
    has-sider
  >
    <n-layout-sider
      class="layout-sider min-h-[100vh] shadow relative z-10 transition-all duration-300 ease-in-out"
      bordered
      :show-trigger="false"
      collapse-mode="width"
      @collapse="collapsed = true"
      @expand="collapsed = false"
      :collapsed="collapsed"
      :position="'static'"
      :width="120"
      :collapsed-width="48"
      :native-scrollbar="false"
    >
      <BaseSideMenu v-model:collapsed="collapsed" />
    </n-layout-sider>
    <n-layout
      class="layout-main bg-gray-200"
      :native-scrollbar="false"
      :scrollbar-props="{ size: 0 }"
    >
      <n-layout-header class="layout-header z-[10]" :position="'absolute'">
      </n-layout-header>
      <n-layout-content
        class="layout-content flex-auto min-h-[97vh] m-2"
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

<style scoped></style>
