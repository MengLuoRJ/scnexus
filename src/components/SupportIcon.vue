<script setup lang="ts">
import { Component } from "vue";

const props = defineProps<{
  link: string;
  preset?: PresetType;
}>();

import DonateAfdianIcon from "@/assets/support-icons/DonateAfdianIcon.vue";
import DonateBMCIcon from "@/assets/support-icons/DonateBMCIcon.vue";
import SupportBilibiliIcon from "@/assets/support-icons/SupportBilibiliIcon.vue";
import SupportQQIcon from "@/assets/support-icons/SupportQQIcon.vue";
import { openExternalWebsite } from "@/composables/useIpcHost/useShellIpc";

const PresetSupport = {
  social: {
    icon: "i-tabler:messages",
  },
  donate: {
    icon: "i-tabler:coffee",
  },
  twitter: {
    icon: "i-tabler:brand-twitter",
    color: "#1D9BF0",
  },
  discord: {
    icon: "i-tabler:brand-discord",
    color: "#616BE6",
  },
  youtube: { icon: "i-tabler:brand-youtube", color: "#DD3E22" },
  weibo: { icon: "i-tabler:brand-weibo", color: "#B94334" },
  bilibili: {
    iconComponent: SupportBilibiliIcon,
    color: "#FB7299",
  },
  qq_group: {
    iconComponent: SupportQQIcon,
    color: "#000000",
  },
  wechat_official_account: {},
  paypal: { icon: "i-tabler:brand-paypal-filled", color: "#000000" },
  patreon: { icon: "i-tabler:brand-patreon", color: "#000000" },
  buymeacoffee: {
    iconComponent: DonateBMCIcon,
    color: "#F0D850",
  },
  afdian: {
    iconComponent: DonateAfdianIcon,
    color: "#946CE6",
  },
} as {
  [key: string]: {
    icon?: string;
    iconSrc?: string;
    iconComponent?: Component;
    color?: string;
  };
};

type PresetType = keyof typeof PresetSupport;

const getPreset = () => {
  return PresetSupport[props.preset!];
};

async function openExternalLink() {
  if (
    !props.link?.startsWith("https://") &&
    !props.link?.startsWith("http://")
  ) {
    return;
  }
  openExternalWebsite(props.link);
}
</script>

<template>
  <div
    v-if="!!props.preset"
    class="support-icon w-[24px] h-[24px] flex justify-center items-center cursor-pointer border border-solid rounded-2 hover:transition-shadow duration-300 hover:shadow"
    :class="`border-[${getPreset()?.color}]`"
  >
    <n-popover trigger="hover" style="max-width: 350px" :show-arrow="false">
      <template #trigger>
        <!-- <img :src="getPreset()?.iconSrc" class="w-[30xp] h-[30px]" /> -->
        <div
          v-if="!!getPreset().icon"
          class="flex justify-center items-center"
          @click="openExternalLink()"
        >
          <div
            class="w-[20px] h-[20px]"
            :class="getPreset().icon + ` text-[${getPreset()?.color}]`"
          ></div>
        </div>
        <div
          v-if="!!getPreset().iconComponent"
          class="flex justify-center items-center"
          @click="openExternalLink()"
        >
          <n-icon :size="24" :component="getPreset()?.iconComponent"></n-icon>
        </div>
      </template>
      <div
        v-if="
          props.link?.startsWith('https://') ||
          props.link?.startsWith('http://')
        "
        class="text-xs"
      >
        <div
          class="flex flex-row justify-center items-center gap-1 text-blue-600"
        >
          <div class="text-xs i-tabler:external-link"></div>
          <div class="text-xs line-clamp-1">
            {{ props.link }}
          </div>
        </div>
        <div class="text-xs">
          {{ "该链接由模组制作者提供，访问时请仔细甄别信息并注意安全。" }}
        </div>
      </div>
      <div v-else class="text-xs">
        <div class="flex flex-row justify-center items-center gap-1">
          {{ props.link }}
        </div>
        <div class="text-xs">
          {{ "该内容由模组制作者提供，请仔细甄别信息并注意安全。" }}
        </div>
      </div>
    </n-popover>
  </div>
</template>
