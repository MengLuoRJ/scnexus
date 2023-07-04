<script lang="ts" setup>
import { computed, onMounted, reactive, ref, unref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { set, get } from "@vueuse/core";
import { MenuList } from "@/composables/useMenuData";

const props = defineProps({
  collapsed: {
    type: Boolean,
    default: false,
  },
});

const router = useRouter();
const currentRoute = useRoute();

type Menu = {
  key: string;
  label: string;
  icon?: any;
  children?: Menu[];
};

const menuList = reactive<Menu[]>(MenuList);
const selectedKey = ref<string>(currentRoute.name as string);

const routeMatched = currentRoute.matched;

const initOpenKeys =
  routeMatched && routeMatched.length
    ? routeMatched.map((item) => item.name)
    : [];

const opKeys = ref(initOpenKeys);

const getSelectedKeys = computed(() => {
  return unref(selectedKey);
});

function clickMenuItem(key: string) {
  if (/http(s)?:/.test(key)) {
    // window.open(key);
    return;
  } else {
    router.push({ name: key });
  }
}

function findRouteChildren(key: string) {
  if (!key) return false;
  const routeChildren: string[] = [];
  unref(menuList).forEach((item) => {
    if (item.children && item.children.length) {
      routeChildren.push(item.key as string);
    }
  });
  return routeChildren.includes(key);
}

function expandMenu(openKeys: string[]) {
  if (!openKeys) return;
  const newopenKeys = openKeys.find((key) => get(opKeys).indexOf(key) === -1);
  const ifChildren = findRouteChildren(newopenKeys as string);
  set(opKeys, ifChildren ? (newopenKeys ? [newopenKeys] : []) : openKeys);
}

function updateSelectedKey() {
  const routeMatched = currentRoute.matched;
  set(
    opKeys,
    routeMatched.map((item) => item.name)
  );
  const activeMenu: string = (currentRoute.meta?.activeMenu as string) || "";
  set(
    selectedKey,
    activeMenu ? (activeMenu as string) : (currentRoute.name as string)
  );
}

watch(
  () => currentRoute.fullPath,
  () => {
    updateSelectedKey();
  }
);

onMounted(() => {
  updateSelectedKey();
});
</script>

<template>
  <div class="side-menu">
    <n-menu
      :mode="'vertical'"
      :options="menuList"
      :collapsed="props.collapsed"
      :collapsed-width="48"
      :collapsed-icon-size="32"
      :indent="12"
      :expanded-keys="(opKeys as string[])"
      :value="getSelectedKeys"
      @update-value="clickMenuItem"
      @update-expanded-keys="expandMenu"
    />
  </div>
</template>
