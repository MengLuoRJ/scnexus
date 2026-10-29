<script lang="ts" setup>
import PackageMarkdown from './PackageMarkdown.vue'
defineOptions({ name: 'ContentPackageDocuments' })
const props = withDefaults(
  defineProps<{
    localId: string
    path: string
    fragment?: string
    documents?: string[]
  }>(),
  { fragment: '', documents: () => [] },
)
const emit = defineEmits<{ navigate: [path: string, fragment?: string] }>()
</script>
<template>
  <div class="min-w-0 space-y-3">
    <div v-if="props.documents.length" class="flex flex-wrap gap-1">
      <UButton
        v-for="path in props.documents"
        :key="path"
        size="xs"
        color="neutral"
        :variant="props.path === path ? 'soft' : 'ghost'"
        class="max-w-full text-left break-all"
        @click="emit('navigate', path)"
        >{{ path }}</UButton
      >
    </div>
    <PackageMarkdown
      :local-id="props.localId"
      :path="props.path"
      :fragment="props.fragment"
      @navigate="(path, fragment) => emit('navigate', path, fragment)"
    />
  </div>
</template>
