<script setup lang="ts">
import { ipcDeepLink } from "@/apis/ipcs/deep-link";
import { ipcSetting } from "@/apis/ipcs/setting";
import { ipcShell } from "@/apis/ipcs/shell";
import BattleNetIcon from "@/assets/BattleNetIcon.vue";
import { useUserStore } from "@/stores/user";
import { onMounted, onUnmounted } from "vue";

const userStore = useUserStore();

async function openBnetAuthIntl() {
  const { data: setting_client_id } = await ipcSetting.getSettingKey(
    "CLIENT_ID"
  );
  const url = new URL(
    import.meta.env.VITE_API_BASE_URL_DEV + "/authentication/bnet-intl"
  );
  url.searchParams.append("client_id", setting_client_id as string);
  await ipcShell.openExternalWebsite(url.toString());
}

onMounted(() => {
  ipcDeepLink.onAuthentication((e, data) => {
    console.log(data);
    if (data.access_token && data.refresh_token)
      userStore.loginUser(data.access_token, data.refresh_token);
  });
});
</script>

<template>
  <div
    class="user-login-panel flex flex-row justify-around items-center py-6 cell-normal hover:shadow"
  >
    <div class="flex flex-col justify-center items-center gap-1">
      <div>{{ "您似乎尚未登录账号" }}</div>
      <div>{{ "请登录账号以解锁更多功能" }}</div>
      <div class="text-gray">{{ "您仍可以未登录状态使用大多数基础功能" }}</div>
    </div>
    <div class="flex flex-col justify-center items-center gap-1">
      <n-button type="primary" :disabled="true">
        <template #icon>
          <n-icon>
            <BattleNetIcon />
          </n-icon>
        </template>
        战网中国登录
      </n-button>
      <n-button type="primary" @click="openBnetAuthIntl()">
        <template #icon>
          <n-icon>
            <BattleNetIcon />
          </n-icon>
        </template>
        战网国际登录
      </n-button>
    </div>
  </div>
</template>
