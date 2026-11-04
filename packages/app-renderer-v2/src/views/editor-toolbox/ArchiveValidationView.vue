<script lang="ts" setup>
import { onScopeDispose, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import type { ArchiveValidation } from '@scnexus/app-shared/types/content.type'
import { normalizeError } from '@scnexus/app-shared/errors/app.error'
import { ipcContentValidateArchive, ipcDialogShowOpenDialog, ipcGetPathForFile } from '../../ipcs'
import { formatFileSize } from '../campaign/formatFileSize'
defineOptions({ name: 'EditorToolboxArchiveValidationView' })
const { t } = useI18n()
const toast = useToast()
const busy = ref(false)
const result = shallowRef<ArchiveValidation | null>(null)
let active = true
onScopeDispose(() => {
  active = false
})
function fail(error: unknown) {
  if (active)
    toast.add({
      color: 'error',
      title: t('toolbox.validationFailed'),
      description: normalizeError(error).message,
    })
}
async function analyze(path: string) {
  if (busy.value) return
  if (!/\.(zip|7z|rar)$/i.test(path)) {
    toast.add({ color: 'error', title: t('toolbox.archiveOnly') })
    return
  }
  busy.value = true
  result.value = null
  try {
    const response = await ipcContentValidateArchive({ kind: 'archive', path })
    if (active) {
      if (response.ok) result.value = response.data
      else
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
async function select() {
  if (busy.value) return
  busy.value = true
  let path: string | undefined
  try {
    const response = await ipcDialogShowOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Archives', extensions: ['zip', '7z', 'rar'] }],
    })
    if (response.ok) {
      if (!response.data.canceled) path = response.data.filePaths[0]
    } else if (active)
      toast.add({
        color: 'error',
        title: t('toolbox.validationFailed'),
        description: response.error.message,
      })
  } catch (error) {
    fail(error)
  } finally {
    if (active) busy.value = false
  }
  if (active && path) await analyze(path)
}
function drop(event: DragEvent) {
  if (busy.value || !event.dataTransfer?.types.includes('Files')) return
  if (event.dataTransfer.files.length !== 1) {
    toast.add({ color: 'error', title: t('toolbox.oneArchive') })
    return
  }
  try {
    const path = ipcGetPathForFile(event.dataTransfer.files[0]!)
    if (path) void analyze(path)
  } catch (error) {
    fail(error)
  }
}
</script>
<template>
  <section class="min-w-0 space-y-3">
    <p class="text-xs text-muted">{{ t('toolbox.validationReadOnly') }}</p>
    <div
      class="rounded border border-default bg-elevated/50 p-4 text-center transition hover:border-primary"
      @dragover.prevent
      @drop.stop.prevent="drop">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-tabler-file-zip"
        :loading="busy"
        :disabled="busy"
        @click="select">
        {{ t(busy ? 'toolbox.analyzing' : 'toolbox.dropArchive') }}
      </UButton>
      <p class="text-xs text-muted">ZIP · 7z · RAR</p>
    </div>
    <template v-if="result">
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
      <UAlert
        v-if="result.diagnostic"
        color="warning"
        :title="t('toolbox.validationWarning')"
        :description="`${result.diagnostic.code}: ${result.diagnostic.message}`" />
      <div class="grid grid-cols-2 gap-3">
        <div
          v-for="standard in ['scnexus', 'ccm'] as const"
          :key="standard"
          class="min-w-0 rounded border border-default p-3">
          <h2 class="text-sm font-semibold">{{ t(`toolbox.standard.${standard}`) }}</h2>
          <p
            v-if="!result.descriptors.some((item) => item.standard === standard)"
            class="mt-2 text-xs text-muted">
            {{ t('toolbox.descriptorMissing') }}
          </p>
          <div
            v-for="descriptor in result.descriptors.filter((item) => item.standard === standard)"
            :key="descriptor.path"
            class="mt-2 space-y-2">
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
        </div>
      </div>
      <div class="space-y-2 rounded border border-default p-3">
        <h2 class="text-sm font-semibold">{{ t('toolbox.automaticRecognition') }}</h2>
        <UBadge :color="result.automatic.preview ? 'success' : 'warning'" variant="subtle">
          {{ t(result.automatic.preview ? 'toolbox.autoAvailable' : 'toolbox.autoUnavailable') }}
        </UBadge>
        <p class="text-xs text-muted">{{ t('toolbox.autoRulesHint') }}</p>
        <p v-if="result.automatic.diagnostic" class="break-all text-xs text-muted">
          {{ result.automatic.diagnostic.code }}: {{ result.automatic.diagnostic.message }}
        </p>
        <p v-if="result.automatic.preview" class="text-xs">
          {{ t('toolbox.recognizedFiles', { count: result.automatic.preview.fileCount }) }} ·
          {{ result.automatic.preview.package.type }}
        </p>
      </div>
    </template>
  </section>
</template>
