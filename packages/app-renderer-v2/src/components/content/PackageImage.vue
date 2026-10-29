<script lang="ts" setup>
import { ref, watch, onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { ipcContentAssets, ipcContentAsset } from '../../ipcs/content'
import { ipcUnwrap } from '../../ipcs/internal/ipc-common'
import { packageImageData } from './packageMarkdown'
defineOptions({ name: 'ContentPackageImage' })
const props = defineProps<{ localId?: string; fallback?: string; alt?: string }>()
const { t } = useI18n()
const image = ref<string | null>(null)
let generation = 0
onScopeDispose(() => {
  generation++
})
watch(
  () => props.localId,
  async (id) => {
    const request = ++generation
    image.value = null
    if (!id) return
    try {
      const assets = await ipcUnwrap(ipcContentAssets(id))
      if (!assets.image || request !== generation) return
      const asset = await ipcUnwrap(ipcContentAsset(id, assets.image))
      if (request === generation) image.value = packageImageData(asset)
    } catch {
      /* Optional artwork falls back to the official image or placeholder. */
    }
  },
  { immediate: true },
)
</script>
<template>
  <img
    v-if="image || props.fallback"
    :src="image || props.fallback"
    :alt="props.alt || ''"
    draggable="false"
    class="h-full w-full object-cover object-top"
    @error="image = null"
  />
  <div
    v-else
    class="flex h-full w-full items-center justify-center bg-elevated text-sm text-muted"
    role="img"
    :aria-label="props.alt || t('contentMedia.noImage')"
  >
    {{ t('contentMedia.noImage') }}
  </div>
</template>
