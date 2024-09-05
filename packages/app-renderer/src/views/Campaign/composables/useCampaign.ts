import { computed, toRaw } from "vue";
import { useThrottleFn } from "@vueuse/core";
import { gt, lt } from "semver";

import { useProfileStore } from "@/stores/profile";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignActiveStore } from "@/stores/campaign-active";

import { useDiscreteApi } from "@/composables/useDiscreteApi";

import { useTrans } from "@/composables/useTrans";

import { CampaignType, MetadataInformated } from "scnexus-standard/metadata";
import { ipcCampaign } from "@/apis/ipcs/campaign";

import WOL_LOGO from "@/assets/campaign/Campaign_WOL_LOGO.png";
import HOTS_LOGO from "@/assets/campaign/Campaign_HOTS_LOGO.png";
import LOTV_LOGO from "@/assets/campaign/Campaign_LOTV_LOGO.png";
import NCO_LOGO from "@/assets/campaign/Campaign_NCO_LOGO.png";
import WOL_Thumbnail from "@/assets/campaign/Campaign_WOL_thumbnail.png";
import HOTS_Thumbnail from "@/assets/campaign/Campaign_HOTS_thumbnail.png";
import LOTV_Thumbnail from "@/assets/campaign/Campaign_LOTV_thumbnail.png";
import Campaign_thumbnail from "@/assets/campaign/Campaign_thumbnail.png";

// import WOL_Banner from "@/assets/campaign/Campaign_WOL_banner.png";
// import HOTS_Banner from "@/assets/campaign/Campaign_HOTS_banner.png";
// import LOTV_Banner from "@/assets/campaign/Campaign_LOTV_banner.png";
// import NCO_Banner from "@/assets/campaign/Campaign_NCO_banner.png";

const { t } = useTrans();

const profileStore = useProfileStore();

export type CampaignConstant = {
  name: string;
  thumbnail: string;
  logo: string;
  banner?: string;
  background?: string;
};

export const CAMPAIGN_CONSTANTS = computed(
  (): Record<CampaignType, CampaignConstant> => {
    return {
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
    };
  }
);

export async function syncActivedCampaignSet() {
  if (!profileStore.SUCCESS) return;

  const { data, error } = await ipcCampaign.getActivedCampaignList();
  if (error) {
    console.log(error);
    return;
  }
  if (data) {
    const campaignActiveStore = useCampaignActiveStore();
    campaignActiveStore.CAMPAIGN_SET = data.CAMPAIGN_SET;
    campaignActiveStore.LAST_REFRESH_TIME = data.LAST_REFRESH_TIME;
  }
}

export async function updateActivedCampaignSet() {
  if (!profileStore.SUCCESS) return;

  const { data, error } = await ipcCampaign.updateActivedCampaignSet();
  if (error) {
    console.log(error);
    return;
  }

  if (data) {
    const campaignActiveStore = useCampaignActiveStore();
    campaignActiveStore.CAMPAIGN_SET = data.CAMPAIGN_SET;
    campaignActiveStore.LAST_REFRESH_TIME = data.LAST_REFRESH_TIME;
  }
}

export async function activeCampaign(infor: MetadataInformated) {
  const { dialog, notification } = useDiscreteApi(["dialog", "notification"]);
  const d = dialog.info({
    closable: false,
    title: "激活战役包",
    content: "正在激活" + infor.name + " 战役包，请稍后…",
  });
  d.loading = true;

  const { error } = await ipcCampaign.activeCampaign(toRaw(infor));
  if (error) {
    console.log(error);
    return;
  }
  await syncActivedCampaignSet();
  d.destroy();
  notification.info({
    title: t("campaign.message.campaign-actived"),
    content: infor.name,
    duration: 3000,
  });
}

export async function unactiveCampaign(
  infor: MetadataInformated,
  constant: CampaignConstant
) {
  const { dialog, notification } = useDiscreteApi(["dialog", "notification"]);

  const d = dialog.info({
    closable: false,
    title: "恢复战役",
    content: "是否将 " + constant.name + " 战役恢复为官方战役？",
    negativeText: "取消",
    positiveText: "确认恢复",
    onPositiveClick: async () => {
      d.loading = true;
      const { error } = await ipcCampaign.unactiveCampaign(infor);
      if (error) {
        console.log(error);
        return;
      }
      await syncActivedCampaignSet();
      notification.info({
        title: t("campaign.message.campaign-recovered", {
          campaign: constant.name,
        }),
        duration: 3000,
      });
    },
  });
}

export async function recoverCampaignType(campaign: CampaignType) {
  const { error } = await ipcCampaign.recoverCampaignType(campaign);
  if (error) {
    console.log(error);
    return;
  }
  await syncActivedCampaignSet();
}

export async function syncCampaignLists() {
  if (!profileStore.SUCCESS) return;

  const { data, error } = await ipcCampaign.getCampaignLists();
  if (error) {
    console.log(error);
    return;
  }
  if (data) {
    const campaignStore = useCampaignStore();
    campaignStore.LAST_REFRESH_TIME = data.LAST_REFRESH_TIME;
    campaignStore.CAMPAIGN_LIST_SET = data.CAMPAIGN_LIST_SET;
  }
}

export async function updateCampaignLists() {
  if (!profileStore.SUCCESS) return;

  const { data, error } = await ipcCampaign.updateCampaignLists();
  if (error) {
    return;
  }

  if (data) {
    const campaignStore = useCampaignStore();
    campaignStore.LAST_REFRESH_TIME = data.LAST_REFRESH_TIME;
    campaignStore.CAMPAIGN_LIST_SET = data.CAMPAIGN_LIST_SET;
  }
}

export async function uninstallCampaign(infor: MetadataInformated) {
  const { dialog, notification } = useDiscreteApi(["dialog", "notification"]);

  const d = dialog.warning({
    closable: false,
    title: "卸载战役·模组",
    content: "是否将 " + infor.name + " 战役·模组卸载并删除相关文件？",
    negativeText: "取消",
    positiveText: "确认删除",
    onPositiveClick: async () => {
      d.loading = true;
      const { data, error } = await ipcCampaign.uninstallCampiagnFiles(
        toRaw(infor)
      );
      if (error) {
        console.log(error);
        return;
      }
      await syncCampaignLists();
      notification.info({
        title: t("campaign.message.campaign-uninstalled", {
          campaign: infor.name,
        }),
        duration: 3000,
      });
    },
  });
}

export async function unactiveAndUninstallCampaign(
  infor: MetadataInformated,
  constant: CampaignConstant
) {
  await unactiveCampaign(infor, constant);

  const { CAMPAIGN_LIST_SET } = useCampaignStore();
  const currentInstalled = CAMPAIGN_LIST_SET[
    infor.campaign as CampaignType
  ].find(
    (item) =>
      item.name === infor.name &&
      item.version === infor.version &&
      item.manager === infor.manager
  );
  if (currentInstalled) {
    await uninstallCampaign(infor);
  }
}

export function checkCampaignSwitchable(infor: MetadataInformated): boolean {
  if (!infor.campaign) return false;

  const { CAMPAIGN_SET } = useCampaignActiveStore();
  const current = CAMPAIGN_SET[infor.campaign];

  if (!current) return true;

  if (infor.name === current.name && infor.manager === current.manager) {
    return false;
  }
  if (infor.name === current.name && lt(infor.version, current.version)) {
    return false;
  }

  return true;
}
