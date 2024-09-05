<script lang="ts" setup></script>

<template>
  <RouterView>
    <template #default="{ Component, route }">
      <Transition name="base-page-content-change" mode="out-in" appear>
        <component :is="Component" :key="route.fullPath" />
      </Transition>
    </template>
  </RouterView>
</template>
<style>
.base-page-content-change-enter-active {
  transition: all 0.1s ease-out;
}

.base-page-content-change-leave-active {
  transition: all 0.1s cubic-bezier(1, 0.5, 0.8, 1);
}

.base-page-content-change-enter-from,
.base-page-content-change-leave-to {
  transform: translateX(10px);
  opacity: 0;
}
</style>
