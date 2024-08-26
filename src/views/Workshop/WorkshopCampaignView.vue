<script setup lang="ts">
import { useFetch } from "@/composables/useFetch";
import router from "@/router";
import { get, set } from "@vueuse/core";
import { onMounted, ref } from "vue";

const props = defineProps<{ type?: "campaign" | "customize" }>();

const page = ref(0);
const page_size = ref(10);
const page_total = ref(0);
const item_list = ref([]);

const loading = ref(false);

async function getCampaignList() {
  set(loading, true);
  const { data, error } = await useFetch("/workshop/customize/list/optioned")
    .post({
      page: get(page),
      take: get(page_size),
    })
    .json();
  if (get(error)) {
    console.warn(error);
    set(loading, false);
  }
  if (get(data)) {
    set(item_list, get(data).data);
    set(page_total, get(data).pageCount);
    set(loading, false);
  }
}

function handleItemClick(snid: number) {
  router.push("/workshop/item/" + snid);
}

onMounted(async () => {
  await getCampaignList();
});
</script>
<template>
  <div class="page-worshop-campaign">
    <div class="flex flex-row justify-between items-center">
      <div
        class="header text-lg flex flex-row justify-start items-center gap-1"
      >
        <div
          class="cursor-pointer hover:text-green"
          @click="router.push('/workshop')"
        >
          {{ "创意工坊" }}
        </div>
        <div>{{ " / " }}</div>
        <div>{{ "战役包作品" }}</div>
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <n-spin :show="loading">
      <div v-if="!item_list.length">
        <n-skeleton v-if="loading" height="120px" />
        <n-result
          v-if="!loading"
          status="404"
          title="暂无相关作品"
          description="生活总归带点荒谬"
        >
          <template #footer>
            <n-button>找点乐子吧</n-button>
          </template>
        </n-result>
      </div>
      <div v-if="item_list.length" class="campaign-list py-2">
        <n-virtual-list
          style="max-height: 100%"
          :item-size="42"
          :items="item_list"
          item-resizable
        >
          <template #default="{ item }">
            <div
              :key="item.snid"
              class="cell-normal hover:shadow my-1 pb-1 flex flex-row justify-between items-center gap-1"
            >
              <div class="flex flex-col justify-start items-start gap-1">
                <div class="flex flex-row justify-start items-center gap-2">
                  <div class="text-base">{{ item.name }}</div>
                  <n-badge :value="'v' + item.version"></n-badge>
                </div>
                <div class="flex flex-row justify-start items-center gap-1">
                  <div class="text-xs text-gray">
                    {{ $t("campaign.detail-mode.author") }}
                  </div>
                  <div class="text-sm">
                    {{ item.author }}
                  </div>
                </div>
                <div class="flex flex-row justify-start items-center gap-1">
                  <div class="text-xs text-gray">
                    {{ $t("campaign.detail-mode.description") }}
                  </div>
                  <div class="text-sm">
                    {{ item.description }}
                  </div>
                </div>
              </div>
              <n-button
                icon-placement="right"
                @click="handleItemClick(item.snid)"
              >
                <template #icon>
                  <div class="i-tabler:chevrons-right"></div>
                </template>
                <div>{{ "详情" }}</div>
              </n-button>
            </div>
          </template>
        </n-virtual-list>
        <n-pagination
          class="py-2"
          v-model:page="page"
          :page-count="page_total"
          @update:page="getCampaignList()"
        />
      </div>
    </n-spin>
  </div>
</template>
