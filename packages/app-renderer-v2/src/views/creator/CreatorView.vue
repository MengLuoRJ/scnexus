<script lang="ts" setup>
import { computed, onScopeDispose, reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { z } from 'zod'
import type { WorkshopPackageSelection } from '@scnexus/app-shared/types/workshop.type'
import {
  apiWorkshopMine,
  apiWorkshopCreate,
  apiWorkshopUpdate,
  apiWorkshopVersions,
  apiWorkshopCreateVersion,
  apiWorkshopCancelCandidate,
  socialKeys,
  sponsorKeys,
  isStrictSemver,
  type OwnerProject,
  type WorkshopVersion,
} from '../../apis/workshop'
import { AccountError, accountErrorKey } from '../../apis/internal/client'
import { useAuthStore } from '../../stores/auth'
import { useCreatorStore } from '../../stores/creator'
import { useContentCenterStore } from '../../stores/content-center'
import { useWorkshopStore, unwrapWorkshop } from '../../stores/workshop'
import {
  ipcWorkshopSelectPackage,
  ipcWorkshopSelectImage,
  ipcWorkshopUpload,
} from '../../ipcs/workshop'
import {
  emptyDocument,
  documentFileIds,
  validateDocument,
  type WorkshopDocument,
} from '../../components/workshop/document'
import WorkshopEditor from '../../components/workshop/WorkshopEditor.vue'
import WorkshopRichText from '../../components/workshop/WorkshopRichText.vue'
defineOptions({ name: 'CreatorView' })
const { t } = useI18n()
const toast = useToast()
const auth = useAuthStore()
const creator = useCreatorStore()
const center = useContentCenterStore()
const transfers = useWorkshopStore()
if (window.scnexus) onScopeDispose(transfers.connect())
onScopeDispose(() => {
  generation++
})
const projects = shallowRef<OwnerProject[]>([])
const versions = shallowRef<WorkshopVersion[]>([])
const selected = shallowRef<OwnerProject | null>(null)
const editing = shallowRef(false)
const loading = shallowRef(false)
const saving = shallowRef(false)
const error = shallowRef<unknown>(null)
const conflict = shallowRef(false)
const selection = shallowRef<WorkshopPackageSelection | null>(null)
const changelog = shallowRef<WorkshopDocument>(emptyDocument())
const detail = shallowRef<WorkshopDocument>(emptyDocument())
const fileIds = shallowRef<string[]>([])
const imageTasks = new Set<string>()
const state = reactive({
  title: '',
  description: '',
  website: '',
  social: {} as Record<string, string>,
  sponsor: {} as Record<string, string>,
})
const allowed = computed(() => center.enabled && auth.signedIn && creator.active)
const schema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .refine((value) => value.trim().length > 0),
  description: z.string().max(1000),
  website: z.string().max(2048),
  social: z.record(z.string(), z.string().max(2048)),
  sponsor: z.record(z.string(), z.string().max(2048)),
})
const packageValid = computed(
  () =>
    selection.value !== null &&
    isStrictSemver(selection.value.manifest.version) &&
    (selection.value.manifest.scnid === undefined ||
      selection.value.manifest.scnid === selected.value?.scnid),
)
let generation = 0
function fail(value: unknown) {
  if (value instanceof AccountError && value.kind === 'stale') return
  toast.add({
    color: 'error',
    title: value instanceof AccountError ? t(accountErrorKey(value)) : t('workshop.operationError'),
  })
}
async function load() {
  const current = ++generation
  projects.value = []
  versions.value = []
  selected.value = null
  editing.value = false
  error.value = null
  if (!allowed.value) return
  loading.value = true
  try {
    const result = await apiWorkshopMine(auth.httpAuth)
    if (current === generation) projects.value = result
  } catch (value) {
    if (current === generation) error.value = value
  } finally {
    if (current === generation) loading.value = false
  }
}
watch(allowed, load, { immediate: true })
watch(() => auth.snapshot.epoch, load)
watch(
  () => transfers.tasks,
  (tasks) => {
    for (const task of tasks) {
      if (imageTasks.has(task.taskId) && task.status === 'completed' && task.fileId) {
        fileIds.value = [...new Set([...fileIds.value, task.fileId])]
        imageTasks.delete(task.taskId)
        toast.add({ color: 'success', title: t('workshop.imageReady') })
      }
    }
  },
)
async function edit(project: OwnerProject | null) {
  const current = ++generation
  imageTasks.clear()
  selected.value = project
  conflict.value = false
  selection.value = null
  changelog.value = emptyDocument()
  versions.value = []
  Object.assign(state, {
    title: project?.title ?? '',
    description: project?.description ?? '',
    website: project?.website ?? '',
    social: { ...project?.social },
    sponsor: { ...project?.sponsor },
  })
  detail.value = project?.detail ?? emptyDocument()
  fileIds.value = [...(project?.fileIds ?? [])]
  editing.value = true
  if (project)
    try {
      const result = await apiWorkshopVersions(auth.httpAuth, project.scnid)
      if (current === generation && selected.value?.scnid === project.scnid) versions.value = result
    } catch (value) {
      fail(value)
    }
}
async function refreshSelected() {
  if (!selected.value) {
    await load()
    return
  }
  const id = selected.value.scnid
  const current = generation
  try {
    const list = await apiWorkshopMine(auth.httpAuth)
    if (current !== generation || !allowed.value) return
    projects.value = list
    const latest = list.find((item) => item.scnid === id)
    if (latest) await edit(latest)
  } catch (value) {
    fail(value)
  }
}
async function save() {
  if (!allowed.value || conflict.value) return
  saving.value = true
  const epoch = auth.snapshot.epoch
  const accountAuth = auth.httpAuth
  try {
    const input = {
      ...schema.parse(state),
      detail: validateDocument(detail.value),
      fileIds: [...new Set([...fileIds.value, ...documentFileIds(detail.value)])],
    }
    const result = selected.value
      ? await apiWorkshopUpdate(
          accountAuth,
          selected.value.scnid,
          selected.value.contentRevision,
          input,
        )
      : await apiWorkshopCreate(accountAuth, input)
    if (epoch !== auth.snapshot.epoch) return
    const list = await apiWorkshopMine(accountAuth)
    if (epoch !== auth.snapshot.epoch) return
    projects.value = list
    const current = list.find((item) => item.scnid === result.scnid)
    if (current) await edit(current)
    toast.add({ color: 'success', title: t('workshop.saved') })
  } catch (value) {
    if (value instanceof AccountError && value.kind === 'conflict') conflict.value = true
    else fail(value)
  } finally {
    saving.value = false
  }
}
async function choosePackage() {
  if (!allowed.value) return
  const current = generation
  try {
    const value = unwrapWorkshop(await ipcWorkshopSelectPackage())
    if (current === generation && allowed.value) selection.value = value
  } catch (value) {
    fail(value)
  }
}
function prefill() {
  const manifest = selection.value?.manifest
  if (!manifest) return
  if (typeof manifest.name === 'string') state.title = manifest.name
  for (const key of ['description', 'website'] as const)
    if (typeof manifest[key] === 'string') state[key] = manifest[key]
  for (const key of ['social', 'sponsor'] as const) {
    const object = manifest[key]
    if (object && typeof object === 'object' && !Array.isArray(object))
      state[key] = Object.fromEntries(
        Object.entries(object).filter(
          ([k, v]) =>
            (key === 'social' ? [...socialKeys] : [...sponsorKeys]).includes(k as never) &&
            typeof v === 'string',
        ),
      ) as Record<string, string>
  }
  toast.add({ color: 'info', title: t('workshop.prefilled') })
}
async function image() {
  if (!allowed.value) return
  const current = generation
  try {
    const task = unwrapWorkshop(await ipcWorkshopSelectImage())
    if (task && current === generation && allowed.value) {
      transfers.accept(task)
      imageTasks.add(task.taskId)
      if (task.status === 'completed' && task.fileId)
        fileIds.value = [...new Set([...fileIds.value, task.fileId])]
    }
  } catch (value) {
    fail(value)
  }
}
async function upload() {
  if (
    !selected.value ||
    !selection.value ||
    !packageValid.value ||
    !allowed.value ||
    conflict.value ||
    selected.value.candidateVersionId
  )
    return
  saving.value = true
  const current = generation
  const project = selected.value
  const packageSelection = selection.value
  try {
    const log = validateDocument(changelog.value)
    if (documentFileIds(log).some((id) => !selected.value!.fileIds.includes(id))) {
      toast.add({ color: 'warning', title: t('workshop.saveImagesFirst') })
      return
    }
    const version = await apiWorkshopCreateVersion(
      auth.httpAuth,
      selected.value.scnid,
      selection.value.manifest,
      log,
    )
    if (current !== generation || !allowed.value || selected.value?.scnid !== project.scnid) return
    // A failed byte transfer must retain its created candidate, never create another implicitly.
    versions.value = [version, ...versions.value]
    selected.value = { ...selected.value, candidateVersionId: version.id }
    transfers.accept(
      unwrapWorkshop(
        await ipcWorkshopUpload({
          selectionId: packageSelection.selectionId,
          versionId: version.id,
        }),
      ),
    )
    selection.value = null
    toast.add({ color: 'success', title: t('workshop.uploadStarted') })
  } catch (value) {
    if (value instanceof AccountError && value.kind === 'conflict') conflict.value = true
    else fail(value)
  } finally {
    saving.value = false
  }
}
const cancelId = shallowRef<string | null>(null)
async function cancelCandidate() {
  if (!cancelId.value || !allowed.value) return
  saving.value = true
  try {
    await apiWorkshopCancelCandidate(auth.httpAuth, cancelId.value)
    cancelId.value = null
    await refreshSelected()
    toast.add({ color: 'success', title: t('workshop.candidateCancelled') })
  } catch (value) {
    fail(value)
  } finally {
    saving.value = false
  }
}
</script>
<template>
  <section class="h-full min-h-0 overflow-y-auto p-4 space-y-4">
    <header class="flex items-center justify-between">
      <h1 class="text-xl font-semibold">{{ t('workshop.creator') }}</h1>
      <UButton to="/uploads" variant="outline" color="neutral">{{ t('workshop.uploads') }}</UButton>
    </header>
    <UAlert v-if="!center.enabled" :title="t('workshop.disabled')" color="warning" />
    <UAlert v-else-if="!allowed" :title="t('workshop.creatorRequired')" color="warning"
      ><template #actions
        ><UButton to="/account?redirect=/creator">{{ t('workshop.account') }}</UButton></template
      ></UAlert
    >
    <template v-else>
      <UProgress v-if="loading" />
      <UAlert v-if="error" :title="t(accountErrorKey(error))" color="error"
        ><template #actions
          ><UButton @click="load">{{ t('workshop.reload') }}</UButton></template
        ></UAlert
      >
      <div class="flex gap-2 items-center">
        <UButton
          v-for="project in projects"
          :key="project.scnid"
          :disabled="saving"
          :variant="selected?.scnid === project.scnid ? 'solid' : 'outline'"
          class="max-w-36"
          @click="edit(project)"
          ><span class="truncate">{{ project.title }}</span></UButton
        ><UButton :disabled="saving || projects.length >= 5" variant="soft" @click="edit(null)">{{
          t('workshop.create')
        }}</UButton>
      </div>
      <p v-if="!editing" class="text-sm text-muted">{{ t('workshop.creatorHint') }}</p>
      <template v-else>
        <UAlert
          v-if="conflict"
          :title="t('workshop.conflict')"
          :description="t('workshop.conflictHint')"
          color="warning"
          ><template #actions
            ><UButton :loading="saving" @click="refreshSelected">{{
              t('workshop.discardReload')
            }}</UButton></template
          ></UAlert
        >
        <div v-if="selected" class="text-xs text-muted">
          SCNID {{ selected.scnid }} · {{ t('workshop.revision') }} {{ selected.contentRevision }} ·
          {{ selected.status }}
        </div>
        <UAlert :title="t('workshop.draftHint')" color="neutral" />
        <div v-if="!selected" class="flex gap-2">
          <UButton :disabled="saving || conflict" @click="choosePackage">{{
            t('workshop.choosePackage')
          }}</UButton>
          <UButton v-if="selection" variant="outline" @click="prefill">{{
            t('workshop.prefill')
          }}</UButton>
        </div>
        <UForm :schema="schema" :state="state" class="space-y-3" @submit="save">
          <div class="grid grid-cols-2 gap-3">
            <UFormField name="title" :label="t('workshop.projectTitle')" required
              ><UInput v-model="state.title" class="w-full" :maxlength="120" /></UFormField
            ><UFormField name="website" :label="t('workshop.website')"
              ><UInput v-model="state.website" class="w-full" :maxlength="2048"
            /></UFormField>
          </div>
          <UFormField name="description" :label="t('workshop.description')"
            ><UTextarea v-model="state.description" class="w-full" :rows="2" :maxlength="1000"
          /></UFormField>
          <details class="text-sm">
            <summary class="cursor-pointer">{{ t('workshop.socialSponsor') }}</summary>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <UFormField v-for="key in socialKeys" :key="key" :name="`social.${key}`" :label="key"
                ><UInput v-model="state.social[key]" class="w-full" :maxlength="2048" /></UFormField
              ><UFormField
                v-for="key in sponsorKeys"
                :key="key"
                :name="`sponsor.${key}`"
                :label="key"
                ><UInput v-model="state.sponsor[key]" class="w-full" :maxlength="2048"
              /></UFormField>
            </div>
          </details>
          <div class="flex justify-between items-center">
            <span class="text-sm">{{ t('workshop.detail') }}</span
            ><UButton size="xs" variant="soft" :disabled="fileIds.length >= 50" @click="image">{{
              t('workshop.uploadImage')
            }}</UButton>
          </div>
          <WorkshopEditor v-model="detail" :file-ids="fileIds" :disabled="saving || conflict" />
          <details v-if="fileIds.length" class="text-sm">
            <summary>{{ t('workshop.files') }} ({{ fileIds.length }}/50)</summary>
            <div v-for="id in fileIds" :key="id" class="flex items-center gap-2">
              <span class="font-mono text-xs truncate">{{ id }}</span
              ><UButton
                size="xs"
                color="neutral"
                variant="link"
                :disabled="documentFileIds(detail).includes(id)"
                @click="fileIds = fileIds.filter((item) => item !== id)"
                >{{ t('workshop.removeReference') }}</UButton
              >
            </div>
          </details>
          <UButton type="submit" :loading="saving" :disabled="conflict">{{
            t('workshop.saveDraft')
          }}</UButton>
        </UForm>
        <UCard v-if="selected" :ui="{ body: 'space-y-3 p-3' }">
          <h2 class="font-semibold">{{ t('workshop.versions') }}</h2>
          <p class="text-sm text-muted">{{ t('workshop.versionHint') }}</p>
          <div
            v-for="version in versions"
            :key="version.id"
            class="border-b border-default pb-2 space-y-1"
          >
            <div class="flex justify-between items-center gap-2">
              <span class="text-sm break-all"
                >{{ version.version }} · {{ version.status }} · {{ version.scanStatus }}</span
              ><UButton
                v-if="
                  selected.candidateVersionId === version.id &&
                  ['DRAFT', 'PENDING_REVIEW'].includes(version.status)
                "
                size="xs"
                color="warning"
                variant="outline"
                @click="cancelId = version.id"
                >{{ t('workshop.cancelCandidate') }}</UButton
              >
            </div>
            <WorkshopRichText :document="version.changelog" />
          </div>
          <UAlert
            v-if="selected.candidateVersionId"
            :title="t('workshop.candidateOccupied')"
            color="warning"
          />
          <div class="flex gap-2">
            <UButton
              :disabled="saving || conflict || !!selected.candidateVersionId"
              @click="choosePackage"
              >{{ t('workshop.choosePackage') }}</UButton
            ><UButton v-if="selection" variant="outline" @click="prefill">{{
              t('workshop.prefill')
            }}</UButton>
          </div>
          <template v-if="selection"
            ><p class="text-sm break-all">
              {{ selection.name }} · {{ selection.size }} bytes · {{ selection.manifest.version }}
            </p>
            <UAlert v-if="!packageValid" :title="t('workshop.invalidVersion')" color="error" />
            <p class="text-xs text-muted break-all">SHA-256 {{ selection.sha256 }}</p>
            <details>
              <summary class="text-sm cursor-pointer">{{ t('workshop.manifest') }}</summary>
              <pre class="text-xs whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{{
                JSON.stringify(selection.manifest, null, 2)
              }}</pre>
            </details>
            <p class="text-sm">{{ t('workshop.changelog') }}</p>
            <WorkshopEditor
              v-model="changelog"
              :file-ids="selected.fileIds"
              :disabled="saving"
            /><UButton
              :loading="saving"
              :disabled="!packageValid || conflict || !!selected.candidateVersionId"
              @click="upload"
              >{{ t('workshop.createUpload') }}</UButton
            ></template
          >
        </UCard>
      </template>
    </template>
    <UModal
      :open="!!cancelId"
      :title="t('workshop.cancelCandidate')"
      :description="t('workshop.cancelCandidateHint')"
      @update:open="
        (value: boolean) => {
          if (!value) cancelId = null
        }
      "
      ><template #footer
        ><UButton color="neutral" variant="outline" @click="cancelId = null">{{
          t('workshop.back')
        }}</UButton
        ><UButton color="warning" :loading="saving" @click="cancelCandidate">{{
          t('workshop.confirm')
        }}</UButton></template
      ></UModal
    >
  </section>
</template>
