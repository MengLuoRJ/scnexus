<script lang="ts" setup>
import { computed, onScopeDispose, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import type { ArchiveValidation, SourceInput } from '@scnexus/app-shared/types/content.type'
import { isErrorDto, normalizeError } from '@scnexus/app-shared/errors/app.error'
import { ipcContentValidateArchive } from '../../ipcs'
import CampaignSourcePicker from '../campaign/components/CampaignSourcePicker.vue'
import FileTree from '../campaign/components/FileTree.vue'
import { countSourceRecognizedFiles } from '../campaign/countSourceRecognizedFiles'
import ValidationPreview from './ValidationPreview.vue'
import { formatFileSize } from '../campaign/formatFileSize'
defineOptions({ name: 'EditorToolboxArchiveValidationView' })
const { t } = useI18n()
const toast = useToast()
const busy = ref(false)
const result = shallowRef<ArchiveValidation | null>(null)
const mode = ref<'scnexus' | 'ccm' | 'auto'>('scnexus')
const modes = computed(() => [
  {
    value: 'scnexus',
    label: t(
      result.value?.modes.scnexus?.origin === 'ccm-converted'
        ? 'toolbox.standard.scnexusCompatible'
        : 'toolbox.standard.scnexus',
    ),
    disabled: !result.value?.modes.scnexus,
  },
  { value: 'ccm', label: t('toolbox.standard.ccm'), disabled: !result.value?.modes.ccm },
  { value: 'auto', label: t('toolbox.automaticRecognition'), disabled: !result.value?.modes.auto },
])
const preview = computed(() => result.value?.modes[mode.value] ?? null)
const descriptors = computed(
  () => result.value?.descriptors.filter((item) => item.standard === mode.value) ?? [],
)
function standardValid(standard: 'scnexus' | 'ccm') {
  return result.value?.descriptors.some((item) => item.standard === standard && item.valid) ?? false
}
let active = true
onScopeDispose(() => {
  active = false
})
function fail(error: unknown) {
  if (active)
    toast.add({
      color: 'error',
      title: t('toolbox.validationFailed'),
      description: isErrorDto(error) ? error.message : normalizeError(error).message,
    })
}
async function analyze(input: SourceInput) {
  if (busy.value) return
  busy.value = true
  result.value = null
  try {
    const response = await ipcContentValidateArchive(input)
    if (active) {
      if (response.ok) {
        result.value = response.data
        mode.value = response.data.modes.scnexus
          ? 'scnexus'
          : standardValid('ccm')
            ? 'ccm'
            : response.data.automatic.preview
              ? 'auto'
              : 'scnexus'
      } else
        toast.add({
          color: 'error',
          title: t('toolbox.validationFailed'),
          description: response.error.message,
        })
    }
  } catch (error) {
    fail(error)
  } finally {
    if (active) busy.value = false
  }
}
</script>
<template>
  <section class="min-w-0 space-y-3">
    <p class="text-xs text-muted">{{ t('toolbox.validationReadOnly') }}</p>
    <CampaignSourcePicker :disabled="busy" action="validate" @select="analyze" @error="fail" />
    <p v-if="busy" role="status" class="text-sm text-muted">{{ t('toolbox.analyzing') }}</p>
    <template v-if="result">
      <section class="space-y-2">
        <h2 class="text-sm font-semibold">{{ t('toolbox.recognitionSummary') }}</h2>
        <div class="grid grid-cols-3 gap-3">
          <div
            v-for="standard in ['scnexus', 'ccm'] as const"
            :key="standard"
            class="min-w-0 space-y-2 rounded border border-default p-3">
            <h3 class="text-sm font-semibold">{{ t(`toolbox.standard.${standard}`) }}</h3>
            <UBadge :color="standardValid(standard) ? 'success' : 'warning'" variant="subtle">
              {{
                t(
                  standardValid(standard)
                    ? 'toolbox.standardSatisfied'
                    : 'toolbox.standardUnsatisfied',
                )
              }}
            </UBadge>
          </div>
          <div class="min-w-0 space-y-2 rounded border border-default p-3">
            <h3 class="text-sm font-semibold">{{ t('toolbox.automaticRecognition') }}</h3>
            <UBadge :color="result.automatic.preview ? 'success' : 'warning'" variant="subtle">
              {{
                t(result.automatic.preview ? 'toolbox.autoAvailable' : 'toolbox.autoUnavailable')
              }}
            </UBadge>
          </div>
        </div>
      </section>
      <div class="text-xs text-muted">
        <p class="break-all">{{ result.source.path }}</p>
        <p>
          {{
            t('toolbox.archiveStats', {
              count: result.fileCount,
              size: formatFileSize(result.bytes),
            })
          }}
        </p>
      </div>
      <p class="text-xs text-muted">
        {{ t('campaign.recognizedFiles') }}: {{ countSourceRecognizedFiles(result.sourceTree) }}
        <template v-if="result.compressedBytes !== undefined">
          · {{ t('campaign.compressedSize') }}: {{ formatFileSize(result.compressedBytes) }}
        </template>
      </p>
      <section>
        <h2 class="mb-2 text-sm font-semibold">{{ t('campaign.sourceTree') }}</h2>
        <div class="max-h-64 overflow-auto rounded border border-default p-2">
          <FileTree :key="result.source.path" :tree="result.sourceTree" />
        </div>
      </section>
      <section class="min-w-0 space-y-3">
        <UTabs v-model="mode" :items="modes" :content="false" />
        <UAlert v-if="mode === 'auto'" color="info" :title="t('toolbox.autoCompatibleHint')" />
        <UAlert
          v-if="result.diagnostic"
          color="warning"
          :title="t('toolbox.validationWarning')"
          :description="`${result.diagnostic.code}: ${result.diagnostic.message}`" />
        <UAlert
          v-if="preview?.origin === 'ccm-converted'"
          color="info"
          :title="t('toolbox.ccmConverted')" />
        <ValidationPreview v-if="preview" :key="mode + preview.descriptorPath" :preview="preview" />
        <p v-else class="text-sm text-muted">{{ t('campaign.modeUnavailable') }}</p>
        <template v-if="mode !== 'auto'">
          <p v-if="!descriptors.length && !preview" class="text-sm text-muted">
            {{ t('toolbox.descriptorMissing') }}
          </p>
          <div
            v-for="descriptor in descriptors"
            :key="descriptor.path"
            class="min-w-0 space-y-2 rounded border border-default p-3">
            <p class="break-all font-mono text-xs">{{ descriptor.path }}</p>
            <UBadge :color="descriptor.valid ? 'success' : 'error'" variant="subtle">
              {{ t(descriptor.valid ? 'toolbox.validationPassed' : 'toolbox.validationInvalid') }}
            </UBadge>
            <p v-if="descriptor.valid" class="text-xs text-muted">
              {{ t('toolbox.recognizedFiles', { count: descriptor.fileCount }) }}
            </p>
            <p v-if="descriptor.error" class="break-all text-xs text-error">
              {{ descriptor.error.code }}: {{ descriptor.error.message }}
            </p>
            <details v-if="descriptor.package && !preview">
              <summary class="cursor-pointer text-xs font-semibold">
                {{ t('toolbox.internalInfo') }}
              </summary>
              <pre class="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{{
                JSON.stringify(descriptor.package, null, 2)
              }}</pre>
            </details>
            <h3 class="text-xs font-semibold">{{ t('toolbox.recognizedFields') }}</h3>
            <dl class="max-h-56 space-y-2 overflow-auto text-xs">
              <div v-for="(field, index) in descriptor.fields" :key="index">
                <dt class="break-all font-mono text-muted">{{ field.name }}</dt>
                <dd class="whitespace-pre-wrap break-all">{{ field.value || '—' }}</dd>
              </div>
            </dl>
            <p v-if="!descriptor.fields.length" class="text-xs text-muted">
              {{ t('toolbox.noFields') }}
            </p>
          </div>
        </template>
        <template v-else>
          <p
            v-if="
              result.automatic.diagnostic &&
              result.automatic.diagnostic.code !== 'AUTO_DESCRIPTOR_PRESENT'
            "
            class="break-all text-xs text-muted">
            {{ result.automatic.diagnostic.code }}: {{ result.automatic.diagnostic.message }}
          </p>
        </template>
      </section>
    </template>
  </section>
</template>
