<script setup lang="ts">
import { openExternalWebsite } from '@/composables/useIpcHost/useShellIpc';

const props = defineProps<{
  link: string;
  clamp?: boolean;
}>();

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
    class="external-link-tooltip flex justify-center items-center cursor-pointer"
    @click="openExternalLink()"
  >
    <n-popover trigger="hover" style="max-width: 350px" :show-arrow="false">
      <template #trigger>
        <div
          class="flex flex-row justify-center items-center gap-1 hover:text-blue-600"
        >
          <div class="text-xs i-tabler:external-link"></div>
          <div v-if="props.clamp" class="text-sm line-clamp-1">
            {{ props.link }}
          </div>
          <div v-else class="text-sm">
            {{ props.link }}
          </div>
        </div>
      </template>
      <div class="text-xs">{{ props.link }}</div>
      <div class="text-xs">
        {{ "该链接由模组制作者提供，访问时请仔细甄别信息并注意安全。" }}
      </div>
    </n-popover>
  </div>
</template>
