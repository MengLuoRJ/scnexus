<script lang="ts" setup>
import { useUserStore } from "@/stores/user";

import UserLoginPanel from "./components/UserLoginPanel.vue";
import UserSafeguardPanel from "./components/UserSafeguardPanel.vue";
import UserCreatorPanel from "./components/UserCreatorPanel.vue";
import UserStarcraftProfilePanel from "./components/UserStarcraftProfilePanel.vue";

const userStore = useUserStore();
</script>
<template>
  <div class="user-page">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">
        <span>{{ "欢迎您，" }}</span>
        <span v-if="userStore.logined">{{ userStore.username }}</span>
        <span v-else>{{ "指挥官" }}</span>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div v-if="userStore.logined" class="flex flex-col gap-2">
      <UserSafeguardPanel />
      <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
      <UserCreatorPanel />
      <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
      <UserStarcraftProfilePanel />
      <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
      <n-button type="warning" @click="userStore.logoutUser">
        {{ "退出登录" }}
      </n-button>
    </div>
    <UserLoginPanel v-else />
  </div>
</template>
