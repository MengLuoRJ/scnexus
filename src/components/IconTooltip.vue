<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    tooltip?: string;
    icon?: string;
  }>(),
  {
    tooltip: "提示",
    icon: "i-tabler:info-circle",
  }
);
</script>

<template>
  <div class="icon-tooltips flex justify-center items-center">
    <n-popover trigger="hover" style="max-width: 200px" :show-arrow="false">
      <template #trigger>
        <div class="cursor-pointer" :class="props.icon"></div>
      </template>
      <div class="text-xs">{{ props.tooltip }}</div>
    </n-popover>
  </div>
</template>
