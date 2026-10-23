<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import frame from '../../../assets/mutators/Ui_coop_ingame_mutatorframe.webp'
const icons = import.meta.glob<string>('../../../assets/mutators/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
defineOptions({ name: 'WeeklyMutationsMutatorIcon' })
const props = defineProps<{ id: string }>()
const failed = ref(false)
const source = computed(() =>
  /^[a-z0-9][a-z0-9_-]{0,79}$/.test(props.id)
    ? (icons[`../../../assets/mutators/${props.id}.png`] ?? null)
    : null,
)
watch(
  () => props.id,
  () => {
    failed.value = false
  },
)
</script>
<template>
  <span class="mutator-icon" aria-hidden="true">
    <img
      v-if="source && !failed"
      :src="source"
      alt=""
      draggable="false"
      class="mutator-icon-image"
      loading="lazy"
      @error="failed = true"
    />
    <span v-else class="mutator-icon-fallback">?</span>
    <img :src="frame" alt="" draggable="false" class="mutator-icon-frame" />
  </span>
</template>
<style scoped>
.mutator-icon {
  position: relative;
  display: block;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
}
.mutator-icon-image {
  position: absolute;
  inset: 8px;
  width: 48px;
  height: 48px;
  object-fit: cover;
}
.mutator-icon-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
.mutator-icon-fallback {
  position: absolute;
  inset: 8px;
  display: grid;
  place-items: center;
  background: var(--ui-bg-elevated);
  color: var(--ui-primary);
  font-size: 24px;
}
</style>
