<script setup lang="ts">
import { useUserStore } from "@/stores/user";
import { storeToRefs } from "pinia";
import { onMounted } from "vue";

const userStore = useUserStore();

const { safeguard } = storeToRefs(userStore);

onMounted(async () => {
  await userStore.requestUserSafeguard();
});
</script>

<template>
  <div class="user-safeguard-panel flex flex-col gap-2">
    <div>{{ "「星际枢纽」账号安全" }}</div>
    <div class="flex flex-row justify-start items-center gap-2">
      <div
        class="flex flex-row justify-around items-center gap-2 px-2 py-2 cell-normal hover:shadow"
      >
        <div
          v-if="safeguard.email_verified"
          class="i-tabler:mail-check w-[28px] h-[28px]"
        ></div>
        <div v-else class="i-tabler:mail-question w-[28px] h-[28px]"></div>
        <div>
          <span>{{ "账号邮箱：" }}</span>
          <span>{{ safeguard.email_verified ? "已验证" : "未验证" }}</span>
        </div>
      </div>
      <div
        class="flex flex-row justify-around items-center gap-2 px-2 py-2 cell-normal hover:shadow"
      >
        <div
          v-if="safeguard.telnum_verified"
          class="i-tabler:device-mobile-check w-[28px] h-[28px]"
        ></div>
        <div
          v-else
          class="i-tabler:device-mobile-question w-[28px] h-[28px]"
        ></div>
        <div>
          <span>{{ "账号手机：" }}</span>
          <span>{{ safeguard.telnum_verified ? "已验证" : "未验证" }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
