<script setup lang="ts">
import { renderNaiveIcon, renderUnoIcon } from "@/composables/useIconRender";
</script>
<template>
  <div class="campaign-management">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">
        {{ $t("campaign.campaign-manager-title") }}
      </div>
      <div class="operation flex flex-row justify-end items-center gap-1">
        <n-button
          size="small"
          :render-icon="renderUnoIcon('i-tabler:refresh', { size: '12px' })"
        >
          {{ $t("campaign.list-refresh") }}
        </n-button>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
  </div>
</template>
