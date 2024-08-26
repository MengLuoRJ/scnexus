<script setup lang="ts">
import { onMounted } from "vue";

const props = defineProps<{ snid: string }>();

onMounted(() => {
  console.log(props.snid);
});
</script>
<template>
  <div class="page-workshop-item">
    <div>{{ props.snid }}</div>
  </div>
</template>
