<script setup lang="ts">
import { ref } from "vue";

const profile = ref(null);
const nova = ref(null)

async function getProfile() {
  profile.value = await window.ipcRenderer.invoke("getProfile");
  console.log(profile.value);
}

async function getNova() {
  nova.value = await window.ipcRenderer.invoke("getActiveCampaignMetadataType", "NCO");
  console.log(nova.value);
}
</script>
<template>
  <div class="cm">
    <div>CustomManage</div>
    <span>{{ profile }}</span>
    <button @click="getProfile()">CustomManage</button>
    <span>{{ nova }}</span>
    <button @click="getNova()">Nova</button>
  </div>
</template>
