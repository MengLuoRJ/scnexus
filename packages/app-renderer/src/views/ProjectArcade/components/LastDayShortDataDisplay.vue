<script lang="ts" setup>
import { useGet } from "@/composables/useDataPA";
import { get, set } from "@vueuse/core";
import { reactive } from "vue";
import { onMounted, ref } from "vue";

const serverRegions = reactive({
  US: {
    key: "US",
    name: "美服",
  },
  EU: {
    key: "EU",
    name: "欧服",
  },
  KR: {
    key: "KR",
    name: "亚服",
  },
  CN: {
    key: "CN",
    name: "国服",
  },
});

const lastDayData = ref({
  date: "",
  lobbiesHostedUS: 0,
  lobbiesHostedEU: 0,
  lobbiesHostedKR: 0,
  lobbiesHostedCN: 0,
  participantsTotalUS: 0,
  participantsTotalEU: 0,
  participantsTotalKR: 0,
  participantsTotalCN: 0,
});

async function getGameStat(
  kind: "daily" | "weekly" | "monthly" = "daily",
  single: boolean = false
) {
  const { data, error } = await useGet(
    "/game-stats/" + kind + (single ? "/single" : "")
  );
  if (get(error)) {
    console.log(error);
    return null;
  }
  if (get(data)) {
    return get(data).data;
  }
}

onMounted(async () => {
  set(lastDayData, await getGameStat("daily", true));
});
</script>

<template>
  <div class="flex flex-row justify-center items-center gap-2">
    <div class="w-[150px] flex flex-col justify-center items-center">
      <div class="text-gray">{{ "亚服" }}</div>
      <div class="text-base">
        <n-number-animation
          ref="lobbiesHostedRef_Asia"
          :from="0"
          :to="lastDayData?.lobbiesHostedKR"
        />
        <span> / </span>
        <n-number-animation
          ref="participantsTotalRef_Asia"
          :from="0"
          :to="lastDayData?.participantsTotalKR"
        />
      </div>
    </div>
    <div class="w-[150px] flex flex-col justify-center items-center">
      <div class="text-gray">{{ "美服" }}</div>
      <div class="text-base">
        <n-number-animation
          ref="lobbiesHostedRef_US"
          :from="0"
          :to="lastDayData?.lobbiesHostedUS"
        />
        <span> / </span>
        <n-number-animation
          ref="participantsTotalRef_US"
          :from="0"
          :to="lastDayData?.participantsTotalUS"
        />
      </div>
    </div>
  </div>
  <div class="mt-2 flex flex-row justify-center items-center gap-2">
    <div class="w-[150px] flex flex-col justify-center items-center">
      <div class="text-gray">{{ "欧服" }}</div>
      <div class="text-base">
        <n-number-animation
          ref="lobbiesHostedRef_EU"
          :from="0"
          :to="lastDayData?.lobbiesHostedEU"
        />
        <span> / </span>
        <n-number-animation
          ref="participantsTotalRef_EU"
          :from="0"
          :to="lastDayData?.participantsTotalEU"
        />
      </div>
    </div>
    <div class="w-[150px] flex flex-col justify-center items-center">
      <div class="text-gray">{{ "国服" }}</div>
      <div class="text-base">
        <n-number-animation
          ref="lobbiesHostedRef_CN"
          :from="0"
          :to="lastDayData?.lobbiesHostedCN"
        />
        <span> / </span>
        <n-number-animation
          ref="participantsTotalRef_CN"
          :from="0"
          :to="lastDayData?.participantsTotalCN"
        />
      </div>
    </div>
  </div>
  <div class="mt-2 text-gray">{{ "大厅总数 / 游玩人次" }}</div>
  <div class="text-gray">
    {{ "最后更新时间：" + new Date(lastDayData.date).toLocaleString() }}
  </div>
</template>
