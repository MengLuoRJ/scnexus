<script setup lang="ts">
import { onMounted, ref, provide } from "vue";
import { useEmitter } from "@/composables/useMitt";
import { usePresetStore } from "@/stores/preset";
import { useRouterGo } from "@/composables/useRouterGo";

import CampaignDisplayGridMode from "./components/CampaignDisplayGridMode.vue";
import CampaignDisplayListMode from "./components/CampaignDisplayListMode.vue";
import CampaignSwitchDrawer from "./components/CampaignSwitchDrawer.vue";

import {
  updateActivedCampaignSet,
  updateCampaignLists,
} from "@/views/campaign/composables/useCampaign";

const preset = usePresetStore();

const refDrawer = ref<InstanceType<typeof CampaignSwitchDrawer> | null>(null);

onMounted(async () => {
  useEmitter("profile-initialized-success", async () => {
    await updateActivedCampaignSet();
    await updateCampaignLists();
  });

  useEmitter("customize-file-unzipped", async () => {
    await updateCampaignLists();
  });
});

provide("refDrawer", refDrawer);
</script>
<template>
  <div class="campaign">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">
        {{ $t("campaign.campaign-manager-title") }}
      </div>
      <div class="operation flex flex-row justify-end items-center gap-1">
        <div class="mr-2 flex flex-row justify-end gap-1">
          <n-switch
            v-model:value="preset.campaign_display_mode"
            checked-value="list"
            unchecked-value="grid"
          >
            <template #checked-icon>
              <div class="i-tabler:float-left"></div>
            </template>
            <template #checked>
              {{ $t("campaign.display-mode.details") }}
            </template>
            <template #unchecked-icon>
              <div class="i-tabler:layout-grid"></div>
            </template>
            <template #unchecked>
              {{ $t("campaign.display-mode.brief") }}
            </template>
          </n-switch>
        </div>
        <n-button size="small" @click="useRouterGo({ name: 'CampaignManage' })">
          <template #icon>
            <div class="i-tabler:folder-cog"></div>
          </template>
          {{ $t("campaign.list-manage") }}
        </n-button>
        <n-button size="small" @click="updateCampaignLists()">
          <template #icon>
            <div class="i-tabler:refresh"></div>
          </template>
          {{ $t("campaign.list-refresh") }}
        </n-button>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <Transition name="display-change" mode="out-in">
      <CampaignDisplayGridMode v-if="preset.campaign_display_mode === 'grid'" />
      <CampaignDisplayListMode
        v-else-if="preset.campaign_display_mode === 'list'"
      />
    </Transition>
    <CampaignSwitchDrawer ref="refDrawer" />
  </div>
</template>
<style scoped>
.display-change-enter-active {
  transition: all 0.1s ease-out;
}

.display-change-leave-active {
  transition: all 0.1s cubic-bezier(1, 0.5, 0.8, 1);
}

.display-change-enter-from,
.display-change-leave-to {
  transform: translateX(10px);
  opacity: 0;
}
</style>
