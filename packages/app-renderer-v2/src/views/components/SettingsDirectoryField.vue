<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
defineOptions({ name: 'SettingsDirectoryField' })
const props = defineProps<{ label: string; path: string; disabled: boolean }>()
const emit = defineEmits<{ open: [path: string] }>()
const { t } = useI18n()
</script>
<template>
  <UFormField :ui="{ container: 'mt-1' }" :label="props.label">
    <div class="flex flex-wrap gap-2">
      <UInput :model-value="props.path" readonly class="min-w-0 basis-full sm:flex-1" />
      <slot />
      <UButton
        icon="i-tabler-external-link"
        color="neutral"
        variant="outline"
        :disabled="props.disabled || !props.path"
        :aria-label="`${t('ui.openDirectory')} · ${props.label}`"
        @click="emit('open', props.path)">
        {{ t('ui.openDirectory') }}
      </UButton>
    </div>
  </UFormField>
</template>
