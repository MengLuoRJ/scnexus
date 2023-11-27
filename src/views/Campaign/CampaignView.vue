<script setup lang="ts">
import { onMounted, ref, h, toRaw, onUnmounted } from "vue";
import { get, set, useThrottleFn } from "@vueuse/core";
import router from "@/router";
import { NImage } from "naive-ui";
import { renderNaiveIcon, renderUnoIcon } from "@/composables/useIconRender";
import { runGameClient } from "@/composables/useIpcHost/useCustomizeIpc";
import { getProfile } from "@/composables/useIpcHost/useSettingIpc";
import { CampaignType, CampaignInformation } from "@shared/types";
import { emiiterOff, emiiterOn } from "@/composables/useMitt";
import { storeToRefs } from "pinia";
import { useCamapignStore } from "@/stores/campaign";
import { useCampaignActiveStore } from "@/stores/campaign-active";
import { usePresetStore } from "@/stores/preset";
import { LocalProfile } from "@shared/types/profile";
import {
  CAMPAIGN_LIST,
  CampaignInfo,
  getCampaignListType,
  refreshCampaignActived,
  refreshCampaignList,
  updateCampaignList,
  recoverCampaign,
  activeNewCampaign,
  uninstallCampaign,
  checkCamapignSwitchable,
} from "@/composables/useService/useCampaignService";

import CustomizeDropZone from "@/components/CustomizeDropZone.vue";
import IconTooltip from "@/components/IconTooltip.vue";

import ExternalLinkTooltip from "@/components/ExternalLinkTooltip.vue";
import SupportIcon from "@/components/SupportIcon.vue";
import EditorIcon from "@/assets/campaign/EditorIcon.vue";

import Campaign_thumbnail from "@/assets/campaign/Campaign_thumbnail.png";

const campaignStore = useCamapignStore();
const campaignActiveStore = useCampaignActiveStore();
const { CAMPAIGN_LIST_SET } = storeToRefs(campaignStore);
const { CAMPAIGN_SET } = storeToRefs(campaignActiveStore);

const preset = usePresetStore();
const switchDrawerActive = ref(false);

const settingProfile = ref<LocalProfile>();

const switchDrawerCampaignList = ref<CampaignInformation[]>();
const switchDrawerCampaignInfo = ref<CampaignInfo>();

function hookupSwitchDrawer(campaign: CampaignType, info: CampaignInfo) {
  set(switchDrawerCampaignList, getCampaignListType(campaign));
  set(switchDrawerCampaignInfo, info);
  set(switchDrawerActive, true);
}

async function runGame() {
  await runGameClient();
}

async function getLocalProfile() {
  const profile = await getProfile();
  set(settingProfile, profile);
}

function goCampaignManagement() {
  router.push("/campaign/manage");
}

onMounted(async () => {
  getLocalProfile();

  refreshCampaignActived();
  refreshCampaignList();

  emiiterOn("customize-file-unzipped", async () => {
    await updateCampaignList();
  });
  emiiterOn("customize-profile-changed", async () => {
    await getLocalProfile();
  });
});

onUnmounted(() => {
  emiiterOff("customize-file-unzipped", async () => {
    await updateCampaignList();
  });
  emiiterOff("customize-profile-changed", async () => {
    await getLocalProfile();
  });
});
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
          @click="refreshCampaignList()"
        >
          {{ $t("campaign.list-refresh") }}
        </n-button>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <Transition name="display-change" mode="out-in">
      <div
        v-if="preset.campaign_display_mode === 'grid'"
        class="campaign-manager -grid flex flex-col"
      >
        <div class="flex flex-row flex-wrap justify-center gap-2">
          <n-card
            v-for="(item, index) in CAMPAIGN_LIST"
            :key="index"
            class="w-[49%]"
            hoverable
          >
            <div class="h-full flex flex-col gap-2">
              <div class="self-center">
                {{
                  $t("campaign.brief-mode.campaign", { campaign: item.name })
                }}
              </div>
              <n-divider :style="{ margin: 0 }" />
              <div
                v-if="!CAMPAIGN_SET[index]"
                class="flex flex-col items-center gap-1"
              >
                <div class="text-sm text-gray-500">
                  {{ $t("campaign.current-campaign") }}
                </div>
                <div class="text-sm">
                  {{ $t("campaign.offcial-campaign", { campaign: item.name }) }}
                </div>
                <div class="text-sm text-gray-500">
                  {{ $t("campaign.no-actived-campaign") }}
                </div>
              </div>
              <div
                v-if="!!CAMPAIGN_SET[index]"
                class="flex flex-col items-center gap-1"
              >
                <div class="text-sm text-gray-500">
                  {{ $t("campaign.current-campaign") }}
                </div>
                <div class="flex flex-row justify-center gap-1 text-sm">
                  <div class="text-center text-black">
                    {{
                      CAMPAIGN_SET[index]?.name ?? $t("campaign.no-campaign")
                    }}
                  </div>
                  <n-badge
                    v-if="!!CAMPAIGN_SET[index]?.version"
                    :value="
                      'v' +
                        CAMPAIGN_SET[index]?.version.match(
                          /\d+(.\d+)(.\d+)?/g
                        )?.[0] ?? 'N/A'
                    "
                  ></n-badge>
                </div>
                <div
                  class="flex flex-col justify-center items-center gap-1 text-sm text-gray-500"
                >
                  <div>
                    {{
                      $t("campaign.brief-mode.author") +
                        CAMPAIGN_SET[index]?.author ?? "NULL"
                    }}
                  </div>
                </div>
              </div>
              <div
                class="mt-auto flex flex-row justify-center items-center flex-wrap gap-1"
              >
                <n-button
                  size="small"
                  type="primary"
                  @click=""
                  :render-icon="
                    renderUnoIcon('i-tabler:player-play', { size: '12px' })
                  "
                >
                  {{ $t("campaign.brief-mode.play") }}
                </n-button>
                <n-button
                  v-if="!CAMPAIGN_SET[index]"
                  size="small"
                  type="info"
                  @click="hookupSwitchDrawer(index, item)"
                  :render-icon="
                    renderUnoIcon('i-tabler:table-options', { size: '12px' })
                  "
                >
                  {{ $t("campaign.brief-mode.active-campaign") }}
                </n-button>
                <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  type="info"
                  @click="hookupSwitchDrawer(index, item)"
                  :render-icon="
                    renderUnoIcon('i-tabler:status-change', {
                      size: '12px',
                    })
                  "
                >
                  {{ $t("campaign.brief-mode.switch-campaign") }}
                </n-button>
                <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  type="info"
                  @click="recoverCampaign(index, item)"
                  :render-icon="
                    renderUnoIcon('i-tabler:refresh', { size: '12px' })
                  "
                >
                  {{ $t("campaign.brief-mode.restore-campaign") }}
                </n-button>
                <!-- <n-button
                  v-if="!!CAMPAIGN_SET[index]"
                  size="small"
                  type="warning"
                  @click="uninstallCampaignType(index)"
                  :render-icon="
                    renderUnoIcon('i-tabler:trash', { size: '12px' })
                  "
                  :disabled="!checkCampaignUninstallable(index)"
                >
                  {{ $t("campaign.brief-mode.uninstall-campaign") }}
                </n-button> -->
              </div>
            </div>
          </n-card>
        </div>
        <n-divider :style="{ margin: '0.5rem 0 0 0' }" />
        <div class="file-drop-zone mt-2">
          <CustomizeDropZone />
        </div>
      </div>
      <div
        v-else-if="preset.campaign_display_mode === 'list'"
        class="campaign-manager -list"
      >
        <n-tabs type="line" animated>
          <n-tab-pane
            v-for="(item, index) in CAMPAIGN_LIST"
            :key="index"
            :name="index"
            :tab="
              () =>
                h(
                  'div',
                  { class: 'flex flex-row justify-start items-center gap-1' },
                  [
                    h(NImage, {
                      src: item.thumbnail,
                      fallbackSrc: Campaign_thumbnail,
                      height: 24,
                      width: 24,
                      previewDisabled: true,
                    }),
                    h('div', undefined, item.name),
                  ]
                )
            "
          >
            <div
              class="rounded-2 bg-cover bg-no-repeat"
              :style="{ backgroundImage: `url(${item.banner})` }"
            >
              <div
                class="flex flex-row gap-2 bg-gradient-to-br from-white from-27.5%"
              >
                <div
                  class="basis-2/5 flex flex-col justify-center items-center gap-1 py-2 border border-gray-200 border-solid rounded-2"
                >
                  <n-image
                    :src="item.logo"
                    preview-disabled
                    height="125"
                    class="mt--6"
                  ></n-image>
                  <div class="self-center mt--6">
                    {{
                      $t("campaign.detail-mode.campaign-title", {
                        campaign: item.name,
                      })
                    }}
                  </div>
                  <n-divider :style="{ margin: 0 }" />
                  <div class="flex flex-col items-center gap-1">
                    <div class="text-sm text-gray-500">
                      {{ $t("campaign.current-campaign") }}
                    </div>
                    <div
                      v-if="!CAMPAIGN_SET[index]"
                      class="text-sm text-gray-500"
                    >
                      {{ $t("campaign.no-actived-campaign") }}
                    </div>
                    <div
                      v-else
                      class="flex flex-col justify-center items-center gap-1 text-sm"
                    >
                      <div class="text-center text-black">
                        {{
                          CAMPAIGN_SET[index]?.name ??
                          $t("campaign.no-campaign")
                        }}
                      </div>
                      <div
                        class="flex flex-row justify-center items-center gap-1"
                      >
                        <n-badge
                          v-if="!!CAMPAIGN_SET[index]?.version"
                          :value="
                            'v' +
                              CAMPAIGN_SET[index]?.version.match(
                                /\d+(.\d+)(.\d+)?/g
                              )?.[0] ?? 'N/A'
                          "
                        ></n-badge>
                        <n-badge
                          v-if="CAMPAIGN_SET[index]?.manager !== 'SCNexus'"
                          type="info"
                          :value="
                            $t('campaign.detail-mode.manager-format', {
                              manager: CAMPAIGN_SET[index]?.manager,
                            })
                          "
                        ></n-badge>
                      </div>
                    </div>
                  </div>
                  <n-divider :style="{ margin: 0 }" />
                  <div
                    class="mt-auto flex flex-col justify-center items-center gap-1"
                  >
                    <n-button
                      v-if="!CAMPAIGN_SET[index]"
                      size="small"
                      block
                      @click="hookupSwitchDrawer(index, item)"
                      :render-icon="
                        renderUnoIcon('i-tabler:table-options', {
                          size: '12px',
                        })
                      "
                    >
                      {{ $t("campaign.detail-mode.active-campaign") }}
                    </n-button>
                    <n-button
                      v-if="!!CAMPAIGN_SET[index]"
                      size="small"
                      block
                      @click="recoverCampaign(index, item)"
                      :render-icon="
                        renderUnoIcon('i-tabler:refresh', { size: '12px' })
                      "
                    >
                      {{ $t("campaign.detail-mode.restore-campaign") }}
                    </n-button>
                    <n-button
                      v-if="!!CAMPAIGN_SET[index]"
                      size="small"
                      block
                      @click="hookupSwitchDrawer(index, item)"
                      :render-icon="
                        renderUnoIcon('i-tabler:status-change', {
                          size: '12px',
                        })
                      "
                    >
                      {{ $t("campaign.detail-mode.switch-campaign") }}
                    </n-button>
                    <!-- <n-button
                      v-if="!!CAMPAIGN_SET[index]"
                      size="small"
                      block
                      @click="uninstallCampaignType(index)"
                      :render-icon="
                        renderUnoIcon('i-tabler:trash', { size: '12px' })
                      "
                      :disabled="!checkCampaignUninstallable(index)"
                    >
                      {{ $t("campaign.detail-mode.uninstall-campaign") }}
                    </n-button> -->
                    <!-- <n-button
                      size="small"
                      block
                      @click=""
                      :render-icon="renderNaiveIcon(EditorIcon)"
                    >
                      {{ $t("campaign.detail-mode.launch-editor") }}
                    </n-button> -->
                    <n-button
                      size="large"
                      type="primary"
                      @click="runGame()"
                      :render-icon="
                        renderUnoIcon('i-tabler:player-play', { size: '12px' })
                      "
                    >
                      {{ $t("campaign.detail-mode.play") }}
                    </n-button>
                  </div>
                </div>
                <div class="basis-3/5 flex flex-col gap-1 cell-normal">
                  <div
                    class="cell-normal mt-1 mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
                  >
                    <div class="text-xs text-gray">
                      {{ $t("campaign.detail-mode.now-playing") }}
                    </div>
                    <div v-if="!!CAMPAIGN_SET[index]" class="text-base">
                      {{ CAMPAIGN_SET[index]?.name }}
                    </div>
                    <div v-if="!!CAMPAIGN_SET[index]" class="text-sm text-gray">
                      {{
                        $t("campaign.detail-mode.campaign", {
                          campaign: item.name,
                        })
                      }}
                    </div>
                    <div v-else class="text-base">
                      {{
                        $t("campaign.offcial-campaign", { campaign: item.name })
                      }}
                    </div>
                  </div>
                  <div
                    v-if="!!CAMPAIGN_SET[index]"
                    class="flex flex-row gap-2 mx-1"
                  >
                    <div
                      class="basis-1/2 flex flex-row justify-start items-center gap-1 px-2 py-1 cell-normal hover:transition-shadow duration-300 hover:shadow"
                    >
                      <div class="text-xs text-gray">
                        {{ $t("campaign.detail-mode.author") }}
                      </div>
                      <div class="text-sm">
                        {{ CAMPAIGN_SET[index]?.author }}
                      </div>
                    </div>
                    <div
                      class="basis-1/2 flex flex-row justify-start items-center gap-1 px-2 py-1 cell-normal hover:transition-shadow duration-300 hover:shadow"
                    >
                      <div class="text-xs text-gray">
                        {{ $t("campaign.detail-mode.version") }}
                      </div>
                      <div class="text-sm">
                        {{ "v" + CAMPAIGN_SET[index]?.version ?? "N/A" }}
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="!!CAMPAIGN_SET[index]"
                    class="cell-normal-white mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
                  >
                    <div class="text-xs text-gray">
                      {{ $t("campaign.detail-mode.description") }}
                    </div>
                    <div v-if="!!CAMPAIGN_SET[index]" class="text-sm">
                      {{ CAMPAIGN_SET[index]?.description }}
                    </div>
                  </div>
                  <div
                    v-if="!!CAMPAIGN_SET[index]?.richinfo?.social"
                    class="flex flex-row gap-2 mx-1"
                  >
                    <div
                      class="basis-1/2 px-2 py-1 cell-normal-white hover:transition-shadow duration-300 hover:shadow"
                    >
                      <div class="text-xs text-gray">
                        {{ $t("campaign.detail-mode.social") }}
                      </div>
                      <div
                        class="mt-1 flex flex-row justify-start items-center gap-1 text-sm"
                      >
                        <SupportIcon
                          v-if="
                            !!CAMPAIGN_SET[index]?.richinfo?.social?.general
                          "
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.general!"
                          preset="social"
                        />
                        <SupportIcon
                          v-if="
                            !!CAMPAIGN_SET[index]?.richinfo?.social?.twitter
                          "
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.twitter!"
                          preset="twitter"
                        />
                        <SupportIcon
                          v-if="
                            !!CAMPAIGN_SET[index]?.richinfo?.social?.discord
                          "
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.discord!"
                          preset="discord"
                        />
                        <SupportIcon
                          v-if="
                            !!CAMPAIGN_SET[index]?.richinfo?.social?.youtube
                          "
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.youtube!"
                          preset="youtube"
                        />
                        <SupportIcon
                          v-if="!!CAMPAIGN_SET[index]?.richinfo?.social?.weibo"
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.weibo!"
                          preset="weibo"
                        />
                        <SupportIcon
                          v-if="
                            !!CAMPAIGN_SET[index]?.richinfo?.social?.bilibili
                          "
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.bilibili!"
                          preset="bilibili"
                        />
                        <SupportIcon
                          v-if="
                            !!CAMPAIGN_SET[index]?.richinfo?.social?.qq_group
                          "
                          :link="CAMPAIGN_SET[index]?.richinfo?.social?.qq_group!"
                          preset="qq_group"
                        />
                      </div>
                    </div>
                    <div
                      class="basis-1/2 px-2 py-1 cell-normal-white hover:transition-shadow duration-300 hover:shadow"
                    >
                      <div class="text-xs text-gray">
                        {{ $t("campaign.detail-mode.donate") }}
                      </div>
                      <div class="text-sm">
                        <div
                          class="mt-1 flex flex-row justify-start items-center gap-1 text-sm"
                        >
                          <SupportIcon
                            v-if="
                              !!CAMPAIGN_SET[index]?.richinfo?.donate?.general
                            "
                            :link="CAMPAIGN_SET[index]?.richinfo?.donate?.general!"
                            preset="donate"
                          />
                          <SupportIcon
                            v-if="
                              !!CAMPAIGN_SET[index]?.richinfo?.donate?.paypal
                            "
                            :link="CAMPAIGN_SET[index]?.richinfo?.donate?.paypal!"
                            preset="paypal"
                          />
                          <SupportIcon
                            v-if="
                              !!CAMPAIGN_SET[index]?.richinfo?.donate?.patreon
                            "
                            :link="CAMPAIGN_SET[index]?.richinfo?.donate?.patreon!"
                            preset="patreon"
                          />
                          <SupportIcon
                            v-if="
                              !!CAMPAIGN_SET[index]?.richinfo?.donate
                                ?.buymeacoffee
                            "
                            :link="CAMPAIGN_SET[index]?.richinfo?.donate?.buymeacoffee!"
                            preset="buymeacoffee"
                          />
                          <SupportIcon
                            v-if="
                              !!CAMPAIGN_SET[index]?.richinfo?.donate?.afdian
                            "
                            :link="CAMPAIGN_SET[index]?.richinfo?.donate?.afdian!"
                            preset="afdian"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div
                    v-if="!!CAMPAIGN_SET[index]?.richinfo?.website"
                    class="cell-normal-white mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
                  >
                    <div class="text-xs text-gray">
                      {{ $t("campaign.detail-mode.website") }}
                    </div>
                    <ExternalLinkTooltip
                      :link="CAMPAIGN_SET[index]?.richinfo?.website!"
                      clamp
                    />
                  </div>
                  <div
                    v-if="!!CAMPAIGN_SET[index]?.snid"
                    class="flex flex-row justify-start items-center gap-2 cell-normal-white mx-1 px-2 py-1 hover:transition-shadow duration-300 hover:shadow"
                  >
                    <div class="text-xs text-gray">
                      {{ $t("campaign.detail-mode.snid") }}
                    </div>
                    <div v-if="!!CAMPAIGN_SET[index]" class="text-xs">
                      {{
                        CAMPAIGN_SET[index]?.snid ??
                        $t("campaign.detail-mode.snid-none")
                      }}
                    </div>
                  </div>
                  <n-alert
                    v-if="!CAMPAIGN_SET[index]"
                    class="mx-1"
                    :title="$t('campaign.detail-mode.no-actived-campaign')"
                    type="info"
                  >
                    <div class="text-xs">
                      {{
                        $t(
                          "campaign.detail-mode.no-actived-campaign-offial-tip"
                        )
                      }}
                    </div>
                    <div class="text-xs">
                      {{
                        $t(
                          "campaign.detail-mode.no-actived-campaign-content-tip"
                        )
                      }}
                    </div>
                  </n-alert>
                  <div class="mt-auto mb-1 mx-1">
                    <CustomizeDropZone />
                  </div>
                </div>
              </div>
            </div>
          </n-tab-pane>
        </n-tabs>
      </div>
    </Transition>
    <n-drawer v-model:show="switchDrawerActive" :width="351">
      <n-drawer-content :body-content-style="{ padding: '0px' }" closable>
        <template #header>
          <div class="flex flex-row justify-start items-center gap-1">
            <n-image
              :src="switchDrawerCampaignInfo?.thumbnail"
              :fallbackSrc="Campaign_thumbnail"
              height="24"
              width="24"
              previewDisabled
            />
            <div>{{ `《${switchDrawerCampaignInfo?.name}》战役·模组` }}</div>
          </div>
        </template>
        <div class="mt-2 mx-1 flex flex-col gap-1">
          <div
            class="px-2 py-1 cell-normal hover:shadow"
            :class="checkCamapignSwitchable(item) ? '' : ' bg-gray-100'"
            v-for="(item, index) in switchDrawerCampaignList"
            :key="index"
          >
            <div class="flex flex-row gap-1">
              <div class="flex flex-col">
                <div class="text-base">{{ item.name }}</div>
                <div class="flex flex-row justify-start gap-1">
                  <div class="text-sm text-gray">
                    {{ "作者：" + item.author ?? "NULL" }}
                  </div>
                </div>
                <div class="mt-1 flex flex-row justify-start gap-1">
                  <n-badge
                    :value="
                      'v' + item.version.match(/\d+(.\d+)?/g)?.[0] ?? 'N/A'
                    "
                  ></n-badge>
                  <n-badge
                    type="info"
                    :value="item.manager + ' 格式管理'"
                  ></n-badge>
                </div>
              </div>
              <div class="ml-auto flex flex-row gap-1 justify-end items-center">
                <n-popover
                  placement="bottom"
                  trigger="hover"
                  :show-arrow="false"
                >
                  <template #trigger>
                    <n-button
                      size="small"
                      @click="uninstallCampaign(item)"
                      :render-icon="
                        renderUnoIcon('i-tabler:trash', { size: '16px' })
                      "
                    >
                    </n-button>
                  </template>
                  <span>{{ "卸载" }}</span>
                </n-popover>
                <n-popover
                  placement="bottom"
                  trigger="hover"
                  :show-arrow="false"
                >
                  <template #trigger>
                    <n-button
                      size="small"
                      @click="
                        activeNewCampaign(item).then(
                          () => (switchDrawerActive = false)
                        )
                      "
                      :render-icon="
                        renderUnoIcon('i-tabler:table-options', {
                          size: '16px',
                        })
                      "
                      :disabled="!checkCamapignSwitchable(item)"
                    >
                    </n-button>
                  </template>
                  <span>{{ "激活" }}</span>
                </n-popover>
              </div>
            </div>
          </div>
        </div>
      </n-drawer-content>
    </n-drawer>
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
