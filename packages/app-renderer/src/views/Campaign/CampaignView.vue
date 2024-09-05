<script setup lang="ts">
import { onMounted, ref, provide } from "vue";
import router from "@/router";
import { renderUnoIcon } from "@/composables/useIconRender";
import { useEmitter } from "@/composables/useMitt";
import { usePresetStore } from "@/stores/preset";

import CampaignDisplayGridMode from "./components/CampaignDisplayGridMode.vue";
import CampaignDisplayListMode from "./components/CampaignDisplayListMode.vue";
import CampaignSwitchDrawer from "./components/CampaignSwitchDrawer.vue";

import {
  updateActivedCampaignSet,
  updateCampaignLists,
} from "./composables/useCampaign";

const preset = usePresetStore();

const refDrawer = ref<InstanceType<typeof CampaignSwitchDrawer> | null>(null);

function goCampaignManagement() {
  router.push("/campaign/manage");
}

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
            size="medium"
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
          <!-- <n-button text style="font-size: 28px" @click="displayMode = 'grid'">
            <n-icon
              :component="
                renderUnoIcon('i-tabler:layout-grid', { size: '28px' })
              "
            ></n-icon>
          </n-button>
          <n-button text style="font-size: 28px" @click="displayMode = 'list'">
            <n-icon
              :component="
                renderUnoIcon('i-tabler:float-left', { size: '28px' })
              "
            ></n-icon>
          </n-button> -->
        </div>
        <n-button
          size="small"
          :render-icon="renderUnoIcon('i-tabler:folder-cog', { size: '12px' })"
          @click="goCampaignManagement()"
        >
          {{ $t("campaign.list-manage") }}
        </n-button>
        <n-button
          size="small"
          :render-icon="renderUnoIcon('i-tabler:refresh', { size: '12px' })"
          @click="updateCampaignLists()"
        >
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
