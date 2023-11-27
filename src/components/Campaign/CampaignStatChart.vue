<script lang="ts" setup>
import { onMounted, ref } from "vue";
import * as echarts from "echarts/core";
import { LegendComponent, LegendComponentOption } from "echarts/components";
import { PieChart, PieSeriesOption } from "echarts/charts";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import { onUnmounted } from "vue";
import { get } from "@vueuse/core";
import { CampaignType } from "@shared/types";

import { CAMPAIGN_LIST } from "@/composables/useService/useCampaignService";
import { filesize } from "filesize";

echarts.use([LegendComponent, PieChart, CanvasRenderer, LabelLayout]);

type EChartsOption = echarts.ComposeOption<
  LegendComponentOption | PieSeriesOption
>;

type STAT_TOTAL = {
  [K in CampaignType]: {
    total_size: number;
    total_file: number;
  };
};

const props = defineProps<{
  data: {
    scnexus: STAT_TOTAL;
    ccm: STAT_TOTAL;
  };
}>();

const refChart = ref();
let chart: echarts.ECharts;

onMounted(() => {
  chart = echarts.init(get(refChart));
  const chartOption: EChartsOption = {
    // legend: {
    //   orient: "vertical",
    //   right: "right",
    //   data: ["WOL", "HOTS", "LOTV", "NCO"],
    //   formatter: (name) => CAMPAIGN_LIST[name as CampaignType].name,
    // },
    series: [
      {
        type: "pie",
        radius: ["15%", "75%"],
        center: ["50%", "50%"],
        itemStyle: {
          borderRadius: 8,
          borderColor: "#fff",
          borderWidth: 1,
        },
        data: [
          ...(["WOL", "HOTS", "LOTV", "NCO"] as CampaignType[]).map((type) => {
            const total_size =
              props.data.scnexus[type].total_size +
              props.data.ccm[type].total_size;
            return total_size
              ? {
                  name: type,
                  value: total_size,
                }
              : {};
          }),
        ],
        label: {
          show: true,
          // formatter: "{b} ({d}%) \n {c} ",
          formatter: ({ name, value, percent }) => {
            return (
              `{${name}|}` +
              `${CAMPAIGN_LIST[name as CampaignType].name}` +
              ` (${percent}%)` +
              "\n" +
              `@ ${filesize(Number(value), { standard: "jedec" })}`
            );
          },
          rich: {
            WOL: {
              height: 18,
              backgroundColor: {
                image: CAMPAIGN_LIST["WOL"].thumbnail,
              },
            },
            HOTS: {
              height: 18,
              backgroundColor: {
                image: CAMPAIGN_LIST["HOTS"].thumbnail,
              },
            },
            LOTV: {
              height: 18,
              backgroundColor: {
                image: CAMPAIGN_LIST["LOTV"].thumbnail,
              },
            },
            NCO: {
              height: 18,
              backgroundColor: {
                image: CAMPAIGN_LIST["NCO"].thumbnail,
              },
            },
          },
        },
      },
    ],
  };
  chart.setOption(chartOption);
});

onUnmounted(() => {
  echarts.dispose(chart);
});
</script>
<template>
  <div ref="refChart" class="campaign-stat-chart w-[100%] h-[200px]"></div>
</template>
