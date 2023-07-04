<script setup lang="ts"></script>

<template>
  <div class="BasicLayout">
    <RouterView>
      <template #default="{ Component, route }">
        <Transition mode="out-in" appear>
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </template>
    </RouterView>
  </div>
</template>
