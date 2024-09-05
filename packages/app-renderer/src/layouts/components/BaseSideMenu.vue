<script lang="ts" setup>
import { useRouter } from "vue-router";
import { MenuList } from "../composables/useMenuData";

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
});

const router = useRouter();

function clickMenuItem(key: string) {
  if (/http(s)?:/.test(key)) {
    // window.open(key);
    return;
  } else {
    router.push({ name: key });
  }
}
</script>

<template>
  <div class="side-menu">
    <n-menu
      :theme-overrides="{ itemColorHover: 'rgba(255, 255, 255, 0)' }"
      :mode="'vertical'"
      :options="MenuList"
      :collapsed="props.collapsed"
      :collapsed-width="48"
      :collapsed-icon-size="32"
      :icon-size="32"
      :indent="6"
      @update-value="clickMenuItem"
    />
  </div>
</template>
