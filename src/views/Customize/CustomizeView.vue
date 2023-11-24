<script setup lang="ts">
import { ref } from "vue";

const profile = ref(null);
const nova = ref(null);

async function getProfile() {
  profile.value = await window.ipcRenderer.invoke("getProfile");
  console.log(profile.value);
}

async function getNova() {
  nova.value = await window.ipcRenderer.invoke(
    "getActiveCampaignMetadataType",
    "NCO"
  );
  console.log(nova.value);
}
</script>
<template>
  <div class="cm">
    <n-alert title="WIP" type="info"> 尚在开发中，敬请期待！ </n-alert>
  </div>
</template>
