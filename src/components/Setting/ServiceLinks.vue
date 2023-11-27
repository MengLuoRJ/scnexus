<script setup lang="ts">
import { openExternalWebsite } from "@/composables/useIpcHost/useShellIpc";

async function openExternalLink(link: string) {
  if (!link?.startsWith("https://") && !link?.startsWith("http://")) {
    return;
  }
  openExternalWebsite(link);
}
</script>
<template>
  <div class="flex flex-row justify-start items-center gap-2">
    <n-button
      @click="openExternalLink('https://scnexus.aiurcovenant.net/')"
      text
    >
      <div>
        {{ "官网指南" }}
      </div>
      <div class="text-sm i-tabler:external-link" />
    </n-button>
    <n-button
      @click="
        openExternalLink(
          'https://scnexus.aiurcovenant.net/guide/#%E4%BA%A4%E6%B5%81%E7%A4%BE%E5%8C%BA'
        )
      "
      text
    >
      <div>
        {{ "交流社群" }}
      </div>
      <div class="text-sm i-tabler:external-link" />
    </n-button>
    <n-button
      @click="openExternalLink('https://scnexus.aiurcovenant.net/sponsor.html')"
      text
    >
      <div>
        {{ "赞助支持" }}
      </div>
      <div class="text-sm i-tabler:external-link" />
    </n-button>
    <n-button
      @click="openExternalLink('https://scnexus.aiurcovenant.net/terms.html')"
      text
    >
      <div>
        {{ "用户协议" }}
      </div>
      <div class="text-sm i-tabler:external-link" />
    </n-button>
    <n-button
      @click="
        openExternalLink('https://scnexus.aiurcovenant.net/privacy-policy.html')
      "
      text
    >
      <div>
        {{ "隐私政策" }}
      </div>
      <div class="text-sm i-tabler:external-link" />
    </n-button>
  </div>
</template>
