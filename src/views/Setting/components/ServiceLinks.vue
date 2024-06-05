<script setup lang="ts">
import { ipcShell } from "@/apis/ipcs/shell";

async function openExternalLink(link: string) {
  if (!link?.startsWith("https://") && !link?.startsWith("http://")) {
    return;
  }
  await ipcShell.openExternalWebsite(link);
}
</script>
<template>
  <div class="service flex flex-col justify-start gap-1">
    <div class="flex flex-row justify-start items-center gap-2">
      <n-button @click="openExternalLink('https://scnexus.net/')" text>
        <div>
          {{ "官网指南" }}
        </div>
        <div class="text-sm i-tabler:external-link" />
      </n-button>
      <n-button
        @click="openExternalLink('https://scnexus.net/terms.html')"
        text
      >
        <div>
          {{ "用户协议" }}
        </div>
        <div class="text-sm i-tabler:external-link" />
      </n-button>
      <n-button
        @click="openExternalLink('https://scnexus.net/privacy-policy.html')"
        text
      >
        <div>
          {{ "隐私政策" }}
        </div>
        <div class="text-sm i-tabler:external-link" />
      </n-button>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <div class="flex flex-row justify-start items-center">
      <div>{{ "遇到任何问题需要帮助？请点击访问：" }}</div>
      <n-button
        @click="
          openExternalLink(
            'https://scnexus.net/guide/#%E4%BA%A4%E6%B5%81%E7%A4%BE%E5%8C%BA'
          )
        "
        text
      >
        <div>
          {{ "交流社群" }}
        </div>
        <div class="text-sm i-tabler:external-link" />
      </n-button>
    </div>
    <div class="flex flex-row justify-start items-center">
      <div>{{ "如果觉得「星际枢纽」还不错，请尝试支持我们：" }}</div>
      <n-button
        @click="openExternalLink('https://scnexus.net/sponsor.html')"
        text
      >
        <div>
          {{ "赞助支持" }}
        </div>
        <div class="text-sm i-tabler:external-link" />
      </n-button>
    </div>
  </div>
</template>
