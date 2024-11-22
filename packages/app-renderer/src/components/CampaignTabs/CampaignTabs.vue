<script lang="ts" setup>
import { CAMPAIGN_CONSTANTS } from "@/views/campaign/composables/useCampaign";
</script>
<template>
  <div class="CampaignTabs">
    <n-tabs type="line" animated>
      <n-tab-pane
        v-for="(constant, index) in CAMPAIGN_CONSTANTS"
        :key="index"
        :name="index"
      >
        <template #tab>
          <div class="flex flex-row justify-start items-center gap-1">
            <n-image
              :src="constant.thumbnail"
              height="24"
              width="24"
              preview-disabled
            ></n-image>
            <div>{{ constant.name }}</div>
          </div>
        </template>
        <slot :constant="constant" :index="index"></slot>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>
<style scoped>
.CampaignTabs :deep(.n-tabs-tab-pad) {
  width: 18px;
}
</style>
