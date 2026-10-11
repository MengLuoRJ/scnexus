<script lang="ts" setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { apiDialogShowOpenDialog, getPathForFile } from '../../../ipcs'
import { AppError, ERRORS, normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { SourceInput } from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'CampaignSourcePicker' })
const props = defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [source: SourceInput]; error: [error: AppErrorDto] }>()
const { t } = useI18n()
const open = ref(false)
const picking = ref(false)
async function select(kind: SourceInput['kind']) {
  open.value = false
  picking.value = true
  try {
    const result = await apiDialogShowOpenDialog({
      properties: [kind === 'directory' ? 'openDirectory' : 'openFile'],
      filters:
        kind === 'archive' ? [{ name: 'Archives', extensions: ['zip', '7z', 'rar'] }] : undefined,
    })
    if (!result.ok) emit('error', result.error)
    else if (!result.data.canceled && result.data.filePaths[0])
      emit('select', { kind, path: result.data.filePaths[0] })
  } catch (value) {
    emit('error', toErrorDto(normalizeError(value)))
  } finally {
    picking.value = false
  }
}
function drop(event: DragEvent) {
  if (props.disabled || picking.value || !event.dataTransfer?.types.includes('Files')) return
  const files = event.dataTransfer.files
  if (!files.length) return
  if (files.length !== 1) {
    emit(
      'error',
      toErrorDto(new AppError(ERRORS.IPC_INVALID_ARGUMENT, { message: t('campaign.oneSource') })),
    )
    return
  }
  try {
    const path = getPathForFile(files[0]!)
    if (path)
      emit('select', { kind: /\.(zip|7z|rar)$/i.test(path) ? 'archive' : 'directory', path })
  } catch (value) {
    emit('error', toErrorDto(normalizeError(value)))
  }
}
</script>
<template>
  <div
    class="rounded border border-default bg-elevated/50 transition-colors hover:border-primary"
    @dragover.prevent
    @drop.stop.prevent="drop"
  >
    <button
      type="button"
      :disabled="props.disabled || picking"
      class="flex min-h-20 w-full items-center justify-center gap-2 p-2 disabled:cursor-not-allowed disabled:opacity-50"
      @click="open = true"
    >
      <UIcon name="i-tabler-file-zip" class="size-9 shrink-0" />
      <span class="text-left"
        ><span class="block text-sm text-default">{{ t('campaign.dropClick') }}</span
        ><span class="block text-xs text-muted"
          >ZIP · 7z · RAR · {{ t('campaign.folder') }}</span
        ></span
      >
    </button>
  </div>
  <UModal v-model:open="open" :title="t('campaign.analyze')">
    <template #body>
      <div class="flex justify-center gap-2">
        <UButton
          icon="i-tabler-file-zip"
          :disabled="props.disabled || picking"
          @click="select('archive')"
          >{{ t('campaign.importArchive') }}</UButton
        >
        <UButton
          icon="i-tabler-folder"
          color="neutral"
          variant="outline"
          :disabled="props.disabled || picking"
          @click="select('directory')"
          >{{ t('campaign.importFolder') }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
