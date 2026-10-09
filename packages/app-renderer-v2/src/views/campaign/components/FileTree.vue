<script lang="ts" setup>
import type { FileTree } from "@scnexus/app-shared/types/content.type";
defineOptions({ name: "CampaignFileTree" });
const props = defineProps<{ tree: FileTree }>();
</script>
<template>
  <ul class="space-y-0.5 text-xs">
    <li>
      <details v-if="props.tree.kind === 'directory'" open>
        <summary class="cursor-pointer text-muted">{{ props.tree.name || "/" }}</summary>
        <div class="border-l border-default pl-2">
          <FileTree v-for="child in props.tree.children" :key="child.path" :tree="child" />
        </div>
      </details>
      <span v-else class="break-all"
        >{{ props.tree.name }} <span class="text-muted">({{ props.tree.bytes }} B)</span></span
      >
    </li>
  </ul>
</template>
