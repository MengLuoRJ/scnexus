<script setup lang="ts"></script>
<template>
  <div class="cm">
    <div class="flex flex-row justify-between items-center">
      <div class="header text-lg">
        {{ "自制作品" }}
      </div>
    </div>
    <n-divider :style="{ marginTop: '6px', marginBottom: '6px' }" />
    <n-alert title="WIP" type="info"> 尚在开发中，敬请期待！ </n-alert>
  </div>
</template>
