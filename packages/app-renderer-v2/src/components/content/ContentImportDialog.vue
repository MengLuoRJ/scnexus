<script lang="ts" setup>
import { watch, onScopeDispose } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useContentImportStore } from '../../stores/content-import'
import { normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type {
  ContentType,
  SourceInput,
  AnalysisResult,
} from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'ContentImportDialog' })
const props = defineProps<{ contentType: ContentType }>()
const emit = defineEmits<{ analyzed: [result: AnalysisResult] }>()
const store = useContentImportStore()
const { busy, source, conflict, error, warnings, pending } = storeToRefs(store)
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
function take() {
  const result = store.take(props.contentType)
  if (result) emit('analyzed', result)
}
watch(pending, take, { immediate: true, flush: 'post' })
watch(error, (value) => {
  if (value)
    toast.add({
      color: 'error',
      title: `${t('ui.error')} · ${value.code}`,
      description: `${value.description}${value.message ? ` · ${value.message}` : ''} · ${value.errorId}`,
    })
})
watch(warnings, (values) => {
  for (const value of values)
    toast.add({
      id: value.errorId,
      color: 'warning',
      title: `${t('ui.warning')} · ${value.code}`,
      description: `${value.description}${value.message ? ` · ${value.message}` : ''} · ${value.errorId}`,
    })
})
async function analyze(input: SourceInput, choice?: 'package-json' | 'metadata-txt') {
  const type = await store.analyze(input, choice)
  if (!type) return
  if (type !== props.contentType) {
    try {
      const failure = await router.push(`/${type}`)
      if (failure) await store.cancel()
    } catch (value) {
      toast.add({
        color: 'error',
        title: t('ui.error'),
        description: toErrorDto(normalizeError(value)).description,
      })
      await store.cancel()
    }
  } else take()
}
function choose(choice: 'package-json' | 'metadata-txt') {
  if (source.value) void analyze(source.value, choice)
}
onScopeDispose(() => {
  if (busy.value || conflict.value) void store.cancel()
})
defineExpose({ analyze })
</script>
<template>
  <UModal
    :open="busy || Boolean(conflict)"
    :title="t(conflict ? 'content.typeConflict' : 'campaign.reading')"
    :dismissible="!busy"
    :close="!busy"
    :ui="{ content: 'sm:max-w-xl', body: 'min-h-0 break-words' }"
    @update:open="
      (value: boolean) => {
        if (!value) store.cancel()
      }
    ">
    <template #body>
      <div v-if="busy" role="status" aria-live="polite" class="space-y-3">
        <p>{{ t('content.classifying') }}</p>
        <UProgress />
      </div>
      <div v-else-if="conflict" class="space-y-3">
        <p>{{ t('content.typeConflictHint') }}</p>
        <p class="break-all text-sm text-muted">{{ source?.path }}</p>
        <p class="text-xs text-muted">{{ conflict.code }} · {{ conflict.errorId }}</p>
      </div>
    </template>
    <template v-if="conflict && !busy" #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="store.cancel()">
          {{ t('campaign.cancel') }}
        </UButton>
        <UButton @click="choose('package-json')">{{ t('content.usePackage') }}</UButton>
        <UButton color="neutral" variant="outline" @click="choose('metadata-txt')">
          {{ t('content.useMetadata') }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
