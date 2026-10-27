<script lang="ts" setup>
import { onScopeDispose } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useWorkshopStore, unwrapWorkshop } from '../../stores/workshop'
import { ipcWorkshopPause, ipcWorkshopResume, ipcWorkshopCancel } from '../../ipcs/workshop'
defineOptions({ name: 'UploadsView' })
const store = useWorkshopStore()
const { t } = useI18n()
const toast = useToast()
if (window.scnexus) onScopeDispose(store.connect())
async function action(run: () => Promise<unknown>) {
  try {
    await run()
    await store.load()
  } catch {
    toast.add({ color: 'error', title: t('workshop.transferError') })
  }
}
</script>
<template>
  <section class="space-y-3">
    <div class="flex gap-2">
      <UButton to="/creator" size="sm" variant="outline">{{ t('workshop.creator') }}</UButton
      ><UButton
        size="sm"
        color="neutral"
        variant="outline"
        :loading="store.loading"
        @click="store.load()"
        >{{ t('workshop.reload') }}</UButton
      >
    </div>
    <UAlert
      v-if="store.error"
      color="neutral"
      variant="subtle"
      :title="t('workshop.transferError')"
    />
    <UAlert
      v-if="!store.uploads.length && !store.loading"
      color="neutral"
      variant="subtle"
      :title="t('workshop.noUploads')"
    />
    <article
      v-for="task in store.uploads"
      :key="task.taskId"
      class="space-y-2 rounded border border-default p-3"
    >
      <div class="flex items-center justify-between gap-2">
        <span class="min-w-0 break-all font-medium">{{ task.name }}</span
        ><UBadge variant="subtle">{{ t(`workshop.task.${task.status}`) }}</UBadge>
      </div>
      <UProgress :model-value="task.size ? Math.round((task.transferred / task.size) * 100) : 0" />
      <p class="text-xs text-muted">{{ task.transferred }} / {{ task.size }} bytes</p>
      <p v-if="task.fileId" class="break-all text-xs text-muted">File ID: {{ task.fileId }}</p>
      <p v-if="task.error" class="break-all text-xs text-error">{{ task.error }}</p>
      <p v-if="task.status === 'unknown'" class="text-sm text-warning">
        {{ t('workshop.unknownUpload') }}
      </p>
      <div class="flex gap-2">
        <UButton
          v-if="task.status === 'running'"
          size="sm"
          variant="outline"
          @click="action(() => ipcWorkshopPause(task.taskId).then(unwrapWorkshop))"
          >{{ t('workshop.pause') }}</UButton
        >
        <UButton
          v-if="['paused', 'failed'].includes(task.status)"
          size="sm"
          @click="action(() => ipcWorkshopResume(task.taskId).then(unwrapWorkshop))"
          >{{ t('workshop.resume') }}</UButton
        >
        <UButton
          v-if="!['completed', 'cancelled'].includes(task.status)"
          size="sm"
          color="neutral"
          variant="outline"
          @click="action(() => ipcWorkshopCancel(task.taskId).then(unwrapWorkshop))"
          >{{ t('campaign.cancel') }}</UButton
        >
      </div>
    </article>
  </section>
</template>
