<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { z } from 'zod'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useAuthStore } from '../../stores/auth'
import { useContentCenterStore } from '../../stores/content-center'
import { useWorkshopStore } from '../../stores/workshop'
defineOptions({ name: 'DownloadWizard' })
const store = useWorkshopStore()
const auth = useAuthStore()
const center = useContentCenterStore()
const router = useRouter()
const { t } = useI18n()
const toast = useToast()
const creating = ref(false)
const newTask = computed(() => store.draft)
const manifestLabels: Record<string, string> = {
  name: 'campaign.name',
  description: 'workshop.description',
  author: 'campaign.author',
  version: 'campaign.version',
  type: 'campaign.type',
  campaign: 'downloads.manifest.campaign',
  scnid: 'downloads.scnid',
  license: 'downloads.manifest.license',
  homepage: 'downloads.manifest.homepage',
}
const manifestFields = computed(() =>
  Object.entries(store.preview?.manifest ?? {})
    .filter(([key]) => Object.hasOwn(manifestLabels, key))
    .map(([key, value]) => ({
      key,
      label: t(manifestLabels[key]!),
      value:
        key === 'type' &&
        typeof value === 'string' &&
        ['campaign', 'customize', 'dependency'].includes(value)
          ? t(`downloads.packageType.${value}`)
          : typeof value === 'object'
            ? JSON.stringify(value)
            : String(value),
    })),
)
const sourceLabel = computed(() => {
  const source = store.preview?.source
  return source && source.kind !== 'workshop'
    ? `${source.repository} · ${source.revision ?? ''}`
    : ''
})
watch(
  () => [store.draft.kind, store.draft.repository, store.draft.revision, store.draft.scnid],
  () => {
    store.preview = null
  },
  { flush: 'sync' },
)
const taskSchema = computed(() =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('github'),
      repository: z
        .string()
        .trim()
        .regex(
          /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/i,
          t('downloads.invalidRepository'),
        ),
      revision: z.string().trim().min(1, t('downloads.invalidBranch')).max(255),
    }),
    z.object({
      kind: z.literal('workshop'),
      scnid: z
        .string()
        .trim()
        .regex(/^[1-9]\d*$/, t('downloads.invalidScnid'))
        .refine(
          (value) => Number.isSafeInteger(Number(value)) && Number(value) <= 2147483647,
          t('downloads.invalidScnid'),
        ),
    }),
  ]),
)

async function createTask() {
  if (creating.value || !taskSchema.value.safeParse(newTask.value).success) return
  if (newTask.value.kind === 'workshop' && !auth.signedIn && center.enabled) {
    store.wizardOpen = false
    await router.push({ path: '/account', query: { redirect: '/downloads?download=resume' } })
    return
  }
  creating.value = true
  try {
    await store.previewDownload()
  } catch (error) {
    toast.add({
      color: 'error',
      title: t('downloads.previewError'),
      description: t(
        error instanceof Error && error.message === 'WORKSHOP_NO_PUBLISHED_VERSION'
          ? 'downloads.noPublishedVersion'
          : newTask.value.kind === 'github'
            ? 'downloads.checkRepository'
            : 'downloads.checkScnid',
      ),
    })
  } finally {
    creating.value = false
  }
}
async function confirm() {
  if (creating.value) return
  creating.value = true
  try {
    const task = await store.confirmDownload()
    toast.add({ color: 'success', title: t('downloads.created'), description: task.name })
  } catch {
    toast.add({ color: 'error', title: t('downloads.createError') })
  } finally {
    creating.value = false
  }
}
</script>
<template>
  <UModal
    :open="store.wizardOpen"
    @update:open="
      (open: boolean) => {
        if (!open) store.closeDownload()
      }
    "
    :title="t('downloads.newTask')"
    :description="t(newTask.kind === 'github' ? 'downloads.githubHint' : 'downloads.workshopHint')"
    :dismissible="!creating"
    :close="!creating"
  >
    <template #body>
      <UForm
        v-if="!store.preview"
        id="new-download-task"
        :schema="taskSchema"
        :state="newTask"
        class="space-y-2"
        @submit="createTask"
      >
        <UFormField :label="t('downloads.source')" name="kind" required>
          <USelect
            v-model="newTask.kind"
            :items="[
              { label: t('downloads.github'), value: 'github' },
              { label: t('downloads.workshop'), value: 'workshop' },
            ]"
            :disabled="creating"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="newTask.kind === 'workshop'"
          :label="t('downloads.scnid')"
          name="scnid"
          required
        >
          <UInput v-model="newTask.scnid" inputmode="numeric" :disabled="creating" class="w-full" />
        </UFormField>
        <UAlert
          v-if="newTask.kind === 'workshop' && !center.enabled"
          color="warning"
          :title="t('workshop.disabled')"
        />
        <UFormField
          v-if="newTask.kind === 'github'"
          :label="t('downloads.repository')"
          name="repository"
          required
        >
          <UInput
            v-model="newTask.repository"
            placeholder="https://github.com/owner/repository"
            :disabled="creating"
            class="w-full"
          />
        </UFormField>
        <UFormField
          v-if="newTask.kind === 'github'"
          :label="t('downloads.branch')"
          name="revision"
          required
        >
          <UInput v-model="newTask.revision" :disabled="creating" class="w-full" />
        </UFormField>
      </UForm>
      <div v-if="store.preview" class="max-h-72 overflow-y-auto space-y-2 break-words">
        <template v-if="store.preview.project">
          <h3 class="font-semibold">{{ store.preview.project.title }}</h3>
          <p class="text-sm whitespace-pre-wrap">{{ store.preview.project.description }}</p>
          <p class="text-xs text-muted">
            SCNID {{ store.preview.project.scnid }} · {{ store.preview.project.approvedVersionId }}
          </p>
        </template>
        <dl v-else class="space-y-2 text-sm">
          <div v-for="field in manifestFields" :key="field.key">
            <dt class="text-muted">{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
        <p class="text-xs text-muted break-all">{{ sourceLabel }}</p>
        <UAlert color="neutral" :title="t('workshop.downloadSafety')" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="creating"
          @click="store.closeDownload()"
          >{{ t('campaign.cancel') }}</UButton
        >
        <UButton
          v-if="store.preview"
          color="neutral"
          variant="outline"
          :disabled="creating"
          @click="store.preview = null"
          >{{ t('downloads.editSource') }}</UButton
        >
        <UButton v-if="store.preview" :loading="creating" @click="confirm">{{
          t('downloads.confirmDownload')
        }}</UButton>
        <UButton
          v-else
          type="submit"
          form="new-download-task"
          :loading="creating"
          :disabled="newTask.kind === 'workshop' && !center.enabled"
          >{{ t('downloads.fetchPreview') }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
