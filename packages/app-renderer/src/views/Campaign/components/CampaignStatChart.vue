<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from "vue";
import { get } from "@vueuse/core";

import * as echarts from "echarts/core";
import { LegendComponent, type LegendComponentOption } from "echarts/components";
import { PieChart, type PieSeriesOption } from "echarts/charts";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

import { filesize } from "filesize";

import type { CampaignType } from "scnexus-standard/metadata";

import { CAMPAIGN_CONSTANTS } from "../composables/useCampaign";

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
    //   formatter: (name) => get(CAMPAIGN_LIST)[name as CampaignType].name,
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
              `${get(CAMPAIGN_CONSTANTS)[name as CampaignType].name}` +
              ` (${percent}%)` +
              "\n" +
              `@ ${filesize(Number(value), { standard: "jedec" })}`
            );
          },
          rich: {
            WOL: {
              height: 18,
              backgroundColor: {
                image: get(CAMPAIGN_CONSTANTS)["WOL"].thumbnail,
              },
            },
            HOTS: {
              height: 18,
              backgroundColor: {
                image: get(CAMPAIGN_CONSTANTS)["HOTS"].thumbnail,
              },
            },
            LOTV: {
              height: 18,
              backgroundColor: {
                image: get(CAMPAIGN_CONSTANTS)["LOTV"].thumbnail,
              },
            },
            NCO: {
              height: 18,
              backgroundColor: {
                image: get(CAMPAIGN_CONSTANTS)["NCO"].thumbnail,
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
