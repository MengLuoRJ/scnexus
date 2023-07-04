<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
const router = useRouter();

onMounted(() => {
  console.log("mounted");
});
</script>
<template>
  <div class="home">
    <div>HomeView</div>
    <button @click="router.push({ name: 'CustomizeManage_index' })">
      CM-Index
    </button>
    <div class="i-tabler:device-gamepad"></div>
  </div>
</template>
