import { get, useThrottleFn } from "@vueuse/core";
import {
  activeCampaign,
  clearCampaignFiles,
  uninstallCampaignFiles,
  updateActiveCampaign,
  updateCampaignLists,
} from "../useIpcHost/useCampaignIpc";
import { useCamapignStore } from "@/stores/campaign";
import { createDiscreteApi, useDialog, useNotification } from "naive-ui";
import { CampaignInformation, CampaignType } from "@shared/types";
import { toRaw } from "vue";
import { useCampaignActiveStore } from "@/stores/campaign-active";
import { i18n } from "@/locales";
const { t } = i18n.global;

import WOL_LOGO from "@/assets/campaign/Campaign_WOL_LOGO.png";
import HOTS_LOGO from "@/assets/campaign/Campaign_HOTS_LOGO.png";
import LOTV_LOGO from "@/assets/campaign/Campaign_LOTV_LOGO.png";
import NCO_LOGO from "@/assets/campaign/Campaign_NCO_LOGO.png";
import WOL_Thumbnail from "@/assets/campaign/Campaign_WOL_thumbnail.png";
import HOTS_Thumbnail from "@/assets/campaign/Campaign_HOTS_thumbnail.png";
import LOTV_Thumbnail from "@/assets/campaign/Campaign_LOTV_thumbnail.png";
import Campaign_thumbnail from "@/assets/campaign/Campaign_thumbnail.png";
import WOL_Banner from "@/assets/campaign/Campaign_WOL_banner.png";
import HOTS_Banner from "@/assets/campaign/Campaign_HOTS_banner.png";
import LOTV_Banner from "@/assets/campaign/Campaign_LOTV_banner.png";
import NCO_Banner from "@/assets/campaign/Campaign_NCO_banner.png";
import { useDiscreteApi } from "../useDiscreteApi";

export type CampaignInfo = {
  name: string;
  thumbnail: string;
  logo: string;
  banner?: string;
  background?: string;
};

export const CAMPAIGN_LIST = {
  WOL: {
    name: t("campaign.WOL.name"),
    logo: WOL_LOGO,
    thumbnail: WOL_Thumbnail,
    // banner: WOL_Banner,
  },
  HOTS: {
    name: t("campaign.HOTS.name"),
    logo: HOTS_LOGO,
    thumbnail: HOTS_Thumbnail,
    // banner: HOTS_Banner,
  },
  LOTV: {
    name: t("campaign.LOTV.name"),
    logo: LOTV_LOGO,
    thumbnail: LOTV_Thumbnail,
    // banner: LOTV_Banner,
  },
  NCO: {
    name: t("campaign.NCO.name"),
    logo: NCO_LOGO,
    thumbnail: Campaign_thumbnail,
    // banner: NCO_Banner,
  },
} as Record<CampaignType, CampaignInfo>;

const { dialog, notification } = useDiscreteApi(["dialog", "notification"]);

const campaignStore = useCamapignStore();
const campaignActiveStore = useCampaignActiveStore();

export async function updateCampaignActived() {
  const data = await updateActiveCampaign();
  campaignActiveStore.CAMPAIGN_SET = data.CAMPAIGN_SET;
  campaignActiveStore.LAST_REFRESH_TIME = data.LAST_REFRESH_TIME;
}

export const refreshCampaignActived = useThrottleFn(async () => {
  await updateCampaignActived();
}, 3000);

export function getCampaignActived() {
  return campaignActiveStore.CAMPAIGN_SET;
}

export async function activeNewCampaign(
  campaignInformation: CampaignInformation
) {
  await activeCampaign(toRaw(campaignInformation));
  notification.info({
    title: t("campaign.message.campaign-actived"),
    content: campaignInformation.name,
    duration: 3000,
  });
  updateCampaignActived();
}

export async function updateCampaignList() {
  const data = await updateCampaignLists();
  campaignStore.LAST_REFRESH_TIME = data.LAST_REFRESH_TIME;
  campaignStore.CAMPAIGN_LIST_SET = data.CAMPAIGN_LIST_SET;
}

export const refreshCampaignList = useThrottleFn(async () => {
  await updateCampaignList();
}, 3000);

export function getCampaignList() {
  return campaignStore.CAMPAIGN_LIST_SET;
}

export function getCampaignListType(campaign: CampaignType) {
  return campaignStore.CAMPAIGN_LIST_SET[campaign];
}

export async function recoverCampaign(
  campaign: CampaignType,
  info: CampaignInfo
) {
  const d = dialog.info({
    closable: false,
    title: "恢复战役",
    content: "是否将 " + info.name + " 战役恢复为官方战役？",
    negativeText: "取消",
    positiveText: "确认恢复",
    onPositiveClick: async () => {
      d.loading = true;
      await clearCampaignFiles(campaign);
      updateCampaignActived();
      notification.info({
        title: t("campaign.message.campaign-recovered", {
          campaign: info.name,
        }),
        duration: 3000,
      });
    },
  });
}

export async function uninstallCampaign(
  campaignInformation: CampaignInformation
) {
  const d = dialog.warning({
    closable: false,
    title: "卸载战役·模组",
    content:
      "是否将 " + campaignInformation.name + " 战役·模组卸载并删除相关文件？",
    negativeText: "取消",
    positiveText: "确认删除",
    onPositiveClick: async () => {
      d.loading = true;
      await clearCampaignFiles(campaignInformation.campaign!);
      updateCampaignActived();
      notification.info({
        title: t("campaign.message.campaign-recovered", {
          campaign: CAMPAIGN_LIST[campaignInformation.campaign!].name,
        }),
        duration: 3000,
      });
      await uninstallCampaignFiles(toRaw(campaignInformation));
      await updateCampaignList();
      notification.info({
        title: t("campaign.message.campaign-uninstalled", {
          campaign: campaignInformation.name,
        }),
        duration: 3000,
      });
    },
  });
}

async function uninstallCampaignType(campaign: CampaignType) {
  const current = campaignActiveStore.CAMPAIGN_SET[campaign];
  if (!current) return;
  const d = dialog.warning({
    closable: false,
    title: "卸载战役·模组",
    content: "是否将 " + current.name + " 战役·模组卸载并删除相关文件？",
    negativeText: "取消",
    positiveText: "确认删除",
    onPositiveClick: async () => {
      d.loading = true;
      await clearCampaignFiles(current.campaign!);
      updateCampaignActived();
      notification.info({
        title: "已成功恢复 " + CAMPAIGN_LIST[current.campaign!].name + " 战役",
        duration: 3000,
      });
      await uninstallCampaignFiles(toRaw(current));
      await updateCampaignList();
      notification.info({
        title: "已成功卸载 " + current.name,
        duration: 3000,
      });
    },
  });
}


export function checkCamapignSwitchable(info: CampaignInformation): boolean {
  if (!info.campaign) return false;
  const current = getCampaignActived()[info.campaign];
  if (!current) return true;
  if (
    info.name === current.name &&
    info.manager === current.manager &&
    info.version === current.version
  )
    return false;
  return true;
}