<script setup lang="ts">
import SCNexusLogo from "@/assets/logo.png";
</script>
<template>
  <div class="home-page">
    <div class="mt-2 flex flex-row justify-start items-center gap-1">
      <n-image
        :src="SCNexusLogo"
        width="45"
        preview-disabled
        class="hero-logo"
      />
      <n-divider vertical :style="{ width: '2px', height: '12px' }" />
      <div class="hero-title text-2xl">{{ "星际枢纽" }}</div>
    </div>
    <n-divider :style="{ marginTop: '12px', marginBottom: '6px' }" />
    <n-alert title="欢迎" type="info"> 欢迎使用 SCNexus ! </n-alert>
  </div>
</template>
<style scoped>
.hero-title {
  font-weight: bolder;
  background: linear-gradient(
      217deg,
      rgba(40, 0, 241, 0.8),
      rgba(255, 0, 0, 0) 70.71%
    ),
    linear-gradient(
      127deg,
      rgba(180, 0, 245, 0.8),
      rgba(241, 82, 146, 0.947) 70.71%
    ),
    linear-gradient(
      336deg,
      rgba(17, 171, 222, 0.823),
      rgba(0, 0, 255, 0) 70.71%
    );
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
</style>
