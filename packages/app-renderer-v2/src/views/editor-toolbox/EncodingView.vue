<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { encodeText, encodingModes, type EncodingMode } from './encoding'
defineOptions({ name: 'EditorToolboxEncodingView' })
const { t } = useI18n()
const toast = useToast()
const source = ref('')
const mode = ref<EncodingMode>('raw')
const copying = ref(false)
const modes = computed(() =>
  encodingModes.map((value) => ({ value, label: t(`toolbox.mode.${value}`) })),
)
const result = computed(() => (source.value ? encodeText(source.value, mode.value) : ''))
async function copy() {
  if (copying.value || !result.value) return
  copying.value = true
  try {
    await navigator.clipboard.writeText(result.value)
    toast.add({ color: 'success', title: t('toolbox.copied') })
  } catch {
    toast.add({ color: 'error', title: t('toolbox.copyFailed') })
  } finally {
    copying.value = false
  }
}
</script>
<template>
  <section class="space-y-3">
    <UButton to="/editor-toolbox" size="sm" color="neutral" variant="outline">{{
      t('toolbox.back')
    }}</UButton>
    <p class="text-xs text-muted">{{ t('toolbox.localHint') }}</p>
    <UFormField :label="t('toolbox.source')">
      <UTextarea
        v-model="source"
        :aria-label="t('toolbox.source')"
        :placeholder="t('toolbox.placeholder')"
        :rows="5"
        class="w-full"
        :ui="{ base: 'resize-y font-mono' }"
      />
    </UFormField>
    <UTabs
      v-model="mode"
      :items="modes"
      :content="false"
      size="sm"
      class="w-full"
      :aria-label="t('toolbox.format')"
    />
    <UFormField :label="t('toolbox.result')">
      <UTextarea
        :model-value="result"
        readonly
        :aria-label="t('toolbox.result')"
        :rows="6"
        class="w-full"
        :ui="{ base: 'resize-y font-mono break-all' }"
        spellcheck="false"
      />
    </UFormField>
    <div class="flex justify-end gap-2">
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :disabled="!source"
        @click="source = ''"
        >{{ t('toolbox.clear') }}</UButton
      >
      <UButton size="sm" :disabled="!result" :loading="copying" @click="copy">{{
        t('toolbox.copy')
      }}</UButton>
    </div>
  </section>
</template>
