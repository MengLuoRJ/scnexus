<script lang="ts" setup>
import { ref } from 'vue'
import { I18nT, useI18n } from 'vue-i18n'
import { ipcDialogShowOpenDialog, ipcGetPathForFile } from '../../../ipcs'
import { AppError, ERRORS, normalizeError, toErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { AppErrorDto } from '@scnexus/app-shared/errors/app.error'
import type { SourceInput } from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'CampaignSourcePicker' })
const props = withDefaults(defineProps<{ disabled: boolean; action?: 'install' | 'validate' }>(), {
  action: 'install',
})
const emit = defineEmits<{ select: [source: SourceInput]; error: [error: AppErrorDto] }>()
const { t } = useI18n()
const picking = ref(false)
async function select(kind: SourceInput['kind']) {
  if (props.disabled || picking.value) return
  picking.value = true
  try {
    const result = await ipcDialogShowOpenDialog({
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
    const path = ipcGetPathForFile(files[0]!)
    if (path)
      emit('select', { kind: /\.(zip|7z|rar)$/i.test(path) ? 'archive' : 'directory', path })
  } catch (value) {
    emit('error', toErrorDto(normalizeError(value)))
  }
}
</script>
<template>
  <div
    class="rounded border border-default bg-elevated/50 transition hover:border-primary hover:shadow-md"
    @dragover.prevent
    @drop.stop.prevent="drop">
    <div class="flex min-h-20 items-center justify-center gap-2 p-2">
      <UIcon
        name="i-tabler-file-zip"
        class="size-9 shrink-0"
        :class="{ 'opacity-50': props.disabled || picking }" />
      <div class="text-left" :class="{ 'opacity-50': props.disabled || picking }">
        <I18nT
          :keypath="
            props.action === 'validate' ? 'toolbox.validationDropClick' : 'campaign.dropClick'
          "
          tag="span"
          scope="global"
          class="block text-sm text-default">
          <template #archive>
            <button
              type="button"
              :disabled="props.disabled || picking"
              class="cursor-pointer text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
              @click.stop="select('archive')">
              {{ t('campaign.archive') }}
            </button>
          </template>
          <template #folder>
            <button
              type="button"
              :disabled="props.disabled || picking"
              class="cursor-pointer text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed"
              @click.stop="select('directory')">
              {{ t('campaign.folder') }}
            </button>
          </template>
        </I18nT>
        <span class="block text-xs text-muted">ZIP · 7z · RAR · {{ t('campaign.folder') }}</span>
      </div>
    </div>
  </div>
</template>
