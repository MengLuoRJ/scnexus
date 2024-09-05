<script setup lang="ts">
import { ipcShell } from "@/apis/ipcs/shell";
import BattleNetIcon from "@/assets/BattleNetIcon.vue";
import { regionById } from "@/composables/useResolver";
import { useUserStore } from "@/stores/user";
import { storeToRefs } from "pinia";

const userStore = useUserStore();

const { profiles } = storeToRefs(userStore);

async function openProfile(url: string) {
  const url_fixed = url.replace("stacraft2", "starcraft2");
  await ipcShell.openExternalWebsite(url_fixed);
}
</script>

<template>
  <div class="user-starcraft-profile-panel flex flex-col gap-2">
    <div>{{ "《星际争霸II》游戏资料" }}</div>
    <div
      v-if="profiles.length === 0"
      class="flex flex-col items-center gap-2 px-2 py-2 cell-normal hover:shadow"
    >
      <div>{{ "尚未检测到您的《星际争霸II》游戏资料" }}</div>
      <div class="text-gray">
        {{ "资料数据可能仍在同步中，稍后再回来看看吧！" }}
      </div>
    </div>
    <div class="flex flex-row flex-wrap gap-2">
      <div
        v-for="(profile, key) in profiles"
        :key="key"
        class="flex flex-row justify-around items-center gap-2 px-2 py-2 cell-normal hover:shadow"
      >
        <n-badge :offset="[-24, 48]">
          <n-avatar :size="48" :src="profile.avatar_url" />
          <template #value>
            <div class="!text-xs">
              {{ regionById(profile.region_id)?.server }}
            </div>
          </template>
        </n-badge>
        <div class="flex flex-col justify-center items-start gap-1">
          <div class="text-base">{{ profile.name }}</div>
          <div class="text-xs">
            <span>{{ "句柄：" }}</span>
            <span>{{ profile.player_handle }}</span>
          </div>
          <div class="flex flex-row justify-start items-center gap-1">
            <n-button @click="openProfile(profile.profile_url)" text>
              <div class="text-xs">
                {{ "查看游戏账号资料" }}
              </div>
              <div class="text-sm i-tabler:external-link" />
            </n-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
