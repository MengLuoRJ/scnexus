<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { formatFileSize } from '../formatFileSize'
import { fileTreeIcon } from './fileTreeIcon'
import type { FileTree } from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'CampaignFileTree' })
const props = defineProps<{ tree: FileTree }>()
const expanded = ref(true)
watch(
  () => [props.tree.path, props.tree.name, props.tree.kind],
  () => {
    expanded.value = !/\.(sc2map|sc2mod)$/i.test(props.tree.name)
  },
  { immediate: true },
)
const appearance = computed(() => fileTreeIcon(props.tree, expanded.value))
function toggle(event: Event) {
  expanded.value = (event.currentTarget as HTMLDetailsElement).open
}
</script>
<template>
  <ul class="file-tree min-w-0 text-xs">
    <li class="min-w-0">
      <details v-if="props.tree.kind === 'directory'" :open="expanded" @toggle="toggle">
        <summary
          class="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
        >
          <UIcon
            :name="expanded ? 'i-tabler-chevron-down' : 'i-tabler-chevron-right'"
            class="size-3 shrink-0 text-muted"
            aria-hidden="true"
          />
          <UIcon
            :name="appearance.icon"
            class="size-4 shrink-0"
            :class="appearance.color"
            aria-hidden="true"
          />
          <span class="min-w-0 break-all">{{ props.tree.name || '/' }}</span>
        </summary>
        <div v-if="expanded" class="ml-2.5 border-l border-default pl-2">
          <FileTree v-for="child in props.tree.children" :key="child.path" :tree="child" />
        </div>
      </details>
      <div v-else class="flex items-center gap-1 rounded py-0.5 pl-5 pr-1 hover:bg-elevated">
        <UIcon
          :name="appearance.icon"
          class="size-4 shrink-0"
          :class="appearance.color"
          aria-hidden="true"
        />
        <span class="min-w-0 break-all"
          >{{ props.tree.name }}
          <span class="text-muted">({{ formatFileSize(props.tree.bytes) }})</span></span
        >
      </div>
    </li>
  </ul>
</template>
<style scoped>
summary {
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
</style>
