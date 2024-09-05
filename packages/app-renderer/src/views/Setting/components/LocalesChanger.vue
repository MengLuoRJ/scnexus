<script setup lang="ts">
import { h, ref } from "vue";
import { NBadge, SelectOption } from "naive-ui";
import { useLocaleStore, AVAILABLE, LOCALE } from "@/stores/locale";
import { get, set } from "@vueuse/core";
import { useLocale } from "@/composables/useTrans";

const localeStore = useLocaleStore();

const locale = useLocale();

const options = ref(
  AVAILABLE.map((item) => ({
    label: item.value,
    value: item.key,
  }))
);

const getOptions = (key: string) => {
  return AVAILABLE.find(
    (item) => item.key === key
  ) as (typeof AVAILABLE)[number];
};

const renderOption = (option: SelectOption) =>
  h("div", { class: "flex flex-row justify-start items-center gap-2" }, [
    h("div", { class: "text-sm" }, { default: () => option.label }),
    h(NBadge, {
      type:
        getOptions(option.value! as string).progress === "100%"
          ? "success"
          : "warning",
      value: `${getOptions(option.value! as string).status} (${
        getOptions(option.value! as string).progress
      }) - ${getOptions(option.value! as string).key}`,
      // + `/ ${getOptions(option.value! as string).cmpt}`,
    }),
  ]);

function updateLocale(value: string) {
  localeStore.setLocale(value as LOCALE);
  set(locale, get(localeStore.current));
}
</script>
<template>
  <div class="flex flex-row items-center gap-1">
    <n-form-item size="small" label-placement="left" :show-feedback="false">
      <template #label>
        <div class="flex flex-row justify-start items-center gap-1">
          <div class="text-sm">{{ "语言/地区" }}</div>
          <IconTooltip :tooltip="'显示语言'" />
        </div>
      </template>
      <n-select
        class="w-[300px] mx-0.5 my-0.5"
        :default-value="localeStore.current"
        :options="options"
        :render-label="renderOption"
        @update:value="updateLocale"
      />
    </n-form-item>
  </div>
</template>
