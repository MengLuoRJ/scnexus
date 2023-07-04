<script setup lang="ts">
import { darkTheme, zhCN, dateZhCN, enUS, dateEnUS } from "naive-ui";
import { computed } from "vue";
const props = withDefaults(
  defineProps<{
    darkTheme?: boolean;
    locale?: "zh-cn" | "en-us";
  }>(),
  {
    darkTheme: false,
    locale: "zh-cn",
  }
);

const naiveLocale = computed(() => {
  switch (props.locale) {
    case "zh-cn":
      return {
        locale: zhCN,
        date: dateZhCN,
      };
    case "en-us":
      return {
        locale: enUS,
        date: dateEnUS,
      };
    default:
      return {
        locale: zhCN,
        date: dateZhCN,
      };
  }
});

const naiveTheme = computed(() => {
  return props.darkTheme ? darkTheme : null;
});
</script>

<template>
  <n-config-provider
    :locale="naiveLocale.locale"
    :date-locale="naiveLocale.date"
    :theme="naiveTheme"
  >
    <n-dialog-provider>
      <n-notification-provider>
        <n-message-provider>
          <slot name="default"></slot>
        </n-message-provider>
      </n-notification-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
