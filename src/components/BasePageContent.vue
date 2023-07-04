<script lang="ts" setup></script>

<template>
  <RouterView>
    <template #default="{ Component, route }">
      <Transition mode="out-in" appear>
        <component :is="Component" :key="route.fullPath" />
      </Transition>
    </template>
  </RouterView>
</template>
