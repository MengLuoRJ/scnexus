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
  isDownloadUrl,
  type DownloadLink,
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
import {
  parseDisplayMetadata,
  validateDisplayChangelog,
  type PackageLocalization,
} from '../../components/workshop/display-metadata'
import { aiUsageFields } from '../../utils/ai-usage'
import AiUsageDetails from '../../components/content/AiUsageDetails.vue'
import WorkshopEditor from '../../components/workshop/WorkshopEditor.vue'
import WorkshopRichText from '../../components/workshop/WorkshopRichText.vue'
import WorkshopReviewModeration from '../../components/workshop/WorkshopReviewModeration.vue'
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
const patch = shallowRef<WorkshopDocument>(emptyDocument())
const detail = shallowRef<WorkshopDocument>(emptyDocument())
const displayChangelog = shallowRef<WorkshopDocument>(emptyDocument())
const importPreview = shallowRef<Record<string, unknown> | null>(null)
const importFields = shallowRef<string[]>([])
const importWarning = shallowRef(false)
const fileIds = shallowRef<string[]>([])
const imageTasks = new Set<string>()
const state = reactive({
  title: '',
  description: '',
  website: '',
  version: '',
  tags: [] as string[],
  localization: [] as PackageLocalization[],
  aiAssistedDevelopment: null as boolean | null,
  aiGeneratedArt: null as boolean | null,
  aiGeneratedVoice: null as boolean | null,
  downloadLinks: [] as DownloadLink[],
  social: {} as Record<string, string>,
  sponsor: {} as Record<string, string>,
})
const allowed = computed(() => center.enabled && auth.signedIn && creator.active)
const aiOptions = computed(() => [
  { label: t('contentMedia.ai.undeclared'), value: 'undeclared' },
  { label: t('contentMedia.ai.used'), value: 'used' },
  { label: t('contentMedia.ai.unused'), value: 'unused' },
])
const schema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .refine((value) => value.trim().length > 0),
  description: z.string().max(1000),
  website: z.string().max(2048),
  version: z.string().refine((value) => value === '' || isStrictSemver(value), {
    error: () => t('workshop.invalidDisplayVersion'),
  }),
  tags: z.array(z.string()),
  localization: z.array(
    z.object({
      locale: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
      author: z.string().optional(),
      version: z.string().optional(),
      translators: z.array(z.string()).optional(),
    }),
  ),
  aiAssistedDevelopment: z.boolean().nullable(),
  aiGeneratedArt: z.boolean().nullable(),
  aiGeneratedVoice: z.boolean().nullable(),
  downloadLinks: z
    .array(
      z.object({
        url: z.string().refine(isDownloadUrl, { error: () => t('workshop.linkError') }),
        description: z.string().max(500),
      }),
    )
    .max(3),
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
  importPreview.value = null
  importFields.value = []
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
watch(() => [auth.snapshot.epoch, auth.snapshot.sessionId], load)
watch(
  allowed,
  (value) => {
    if (value) void creator.loadQuota().catch(fail)
  },
  { immediate: true },
)
function operationCurrent() {
  const version = generation
  const epoch = auth.snapshot.epoch
  const sessionId = auth.snapshot.sessionId
  return () =>
    version === generation &&
    epoch === auth.snapshot.epoch &&
    sessionId === auth.snapshot.sessionId &&
    allowed.value
}
async function refreshQuotaConflict() {
  const current = operationCurrent()
  try {
    await creator.loadQuota()
  } finally {
    if (current()) toast.add({ color: 'warning', title: t('workshop.quotaConflict') })
  }
}
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
  patch.value = emptyDocument()
  importPreview.value = null
  importFields.value = []
  displayChangelog.value = project?.changelog ?? emptyDocument()
  versions.value = []
  Object.assign(state, {
    title: project?.title ?? '',
    description: project?.description ?? '',
    website: project?.website ?? '',
    version: project?.version ?? '',
    tags: [...(project?.tags ?? [])],
    localization: (project?.localization ?? []).map((item) => ({
      ...item,
      ...(item.translators ? { translators: [...item.translators] } : {}),
    })),
    aiAssistedDevelopment: project?.aiAssistedDevelopment ?? null,
    aiGeneratedArt: project?.aiGeneratedArt ?? null,
    aiGeneratedVoice: project?.aiGeneratedVoice ?? null,
    downloadLinks: (project?.downloadLinks ?? []).map((link) => ({ ...link })),
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
  if (!allowed.value || conflict.value || saving.value) return
  saving.value = true
  const current = operationCurrent()
  const creating = !selected.value
  const accountAuth = auth.httpAuth
  try {
    if (creating) {
      const quota = await creator.loadQuota()
      if (!current()) return
      const list = await apiWorkshopMine(accountAuth)
      if (!current()) return
      projects.value = list
      if (list.length >= quota.maxProjects) {
        toast.add({
          color: 'warning',
          title: t('workshop.projectQuotaReached', { max: quota.maxProjects }),
        })
        return
      }
    }
    const input = {
      ...schema.parse(state),
      ...parseDisplayMetadata(state.tags, state.localization),
      version: state.version === '' ? null : state.version,
      changelog: validateDisplayChangelog(displayChangelog.value),
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
    if (!current()) return
    const list = await apiWorkshopMine(accountAuth)
    if (!current()) return
    projects.value = list
    const saved = list.find((item) => item.scnid === result.scnid)
    if (saved) await edit(saved)
    toast.add({ color: 'success', title: t('workshop.saved') })
  } catch (value) {
    if (!current()) return
    if (value instanceof AccountError && value.kind === 'conflict') {
      if (creating) await refreshQuotaConflict().catch(fail)
      else conflict.value = true
    } else fail(value)
  } finally {
    saving.value = false
  }
}
async function choosePackage() {
  if (!allowed.value || saving.value) return
  const current = operationCurrent()
  try {
    const quota = await creator.loadQuota()
    if (!current()) return
    const value = unwrapWorkshop(await ipcWorkshopSelectPackage())
    if (!current()) return
    if (value && value.size > quota.maxPackageBytes) {
      toast.add({
        color: 'warning',
        title: t('workshop.packageQuotaExceeded', { max: quota.maxPackageBytes }),
      })
      selection.value = null
      return
    }
    selection.value = value
  } catch (value) {
    if (current()) fail(value)
  }
}
function prefill() {
  const manifest = selection.value?.manifest
  if (!manifest || saving.value || conflict.value) return
  const candidate: Record<string, unknown> = {}
  importWarning.value = selection.value?.displayChangelogWarning === true
  for (const field of aiUsageFields)
    if (typeof manifest[field] === 'boolean') candidate[field] = manifest[field]
  if (typeof manifest.name === 'string') candidate.title = manifest.name
  for (const key of ['description', 'website'] as const)
    if (typeof manifest[key] === 'string') candidate[key] = manifest[key]
  for (const key of ['social', 'sponsor'] as const) {
    const object = manifest[key]
    if (object && typeof object === 'object' && !Array.isArray(object))
      candidate[key] = Object.fromEntries(
        Object.entries(object).filter(
          ([k, v]) =>
            (key === 'social' ? [...socialKeys] : [...sponsorKeys]).includes(k as never) &&
            typeof v === 'string',
        ),
      )
  }
  if (isStrictSemver(manifest.version)) candidate.version = manifest.version
  else if (manifest.version !== undefined) importWarning.value = true
  try {
    const metadata = parseDisplayMetadata(manifest.tags ?? [], manifest.localization ?? [])
    if (manifest.tags !== undefined) candidate.tags = metadata.tags
    if (manifest.localization !== undefined) candidate.localization = metadata.localization
  } catch {
    importWarning.value = true
  }
  if (selection.value?.displayChangelog) {
    try {
      candidate.changelog = validateDisplayChangelog(selection.value.displayChangelog)
    } catch {
      importWarning.value = true
    }
  }
  importPreview.value = JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>
  importFields.value = Object.keys(candidate).filter(
    (key) => JSON.stringify(candidate[key]) !== JSON.stringify(currentImportValue(key)),
  )
}
function currentImportValue(key: string): unknown {
  return key === 'changelog' ? displayChangelog.value : state[key as keyof typeof state]
}
function importLabel(key: string): string {
  const labels: Record<string, string> = {
    title: 'workshop.projectTitle',
    description: 'workshop.description',
    website: 'workshop.website',
    version: 'workshop.displayVersion',
    tags: 'workshop.tags',
    localization: 'workshop.localization',
    changelog: 'workshop.changelog',
    social: 'workshop.socialSponsor',
    sponsor: 'workshop.socialSponsor',
  }
  return t(labels[key] ?? `contentMedia.ai.${key}`)
}
function importText(key: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (aiUsageFields.includes(key as (typeof aiUsageFields)[number]))
    return t(
      value === true
        ? 'contentMedia.ai.used'
        : value === false
          ? 'contentMedia.ai.unused'
          : 'contentMedia.ai.undeclared',
    )
  if (key === 'changelog') {
    const text = (node: { text?: string; content?: unknown[] }): string =>
      node.text ?? (node.content ?? []).map((child) => text(child as typeof node)).join('\n')
    return text(value as Parameters<typeof text>[0]) || '—'
  }
  if (key === 'localization')
    return (
      (value as PackageLocalization[])
        .map((item) =>
          [
            item.locale,
            ...(['name', 'description', 'author', 'version'] as const)
              .filter((field) => item[field] !== undefined)
              .map((field) => `${t(`workshop.locale.${field}`)}: ${item[field]}`),
            ...(item.translators
              ? [`${t('workshop.locale.translators')}: ${item.translators.join(', ')}`]
              : []),
          ].join('\n'),
        )
        .join('\n\n') || '—'
    )
  if (Array.isArray(value)) return value.join(', ') || '—'
  if (typeof value === 'object')
    return (
      Object.entries(value)
        .map(([name, content]) => `${name}: ${content}`)
        .join('\n') || '—'
    )
  return String(value)
}
function applyPrefill() {
  if (!importPreview.value || saving.value || conflict.value || !allowed.value) return
  const values = Object.fromEntries(
    importFields.value.map((key) => [key, importPreview.value![key]]),
  )
  if (values.changelog) displayChangelog.value = validateDisplayChangelog(values.changelog)
  delete values.changelog
  Object.assign(state, values)
  importPreview.value = null
  importFields.value = []
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
    saving.value ||
    selected.value.candidateVersionId
  )
    return
  saving.value = true
  const current = operationCurrent()
  const project = selected.value
  const packageSelection = selection.value
  try {
    const quota = await creator.loadQuota()
    if (!current()) return
    if (packageSelection.size > quota.maxPackageBytes) {
      toast.add({
        color: 'warning',
        title: t('workshop.packageQuotaExceeded', { max: quota.maxPackageBytes }),
      })
      return
    }
    const log = validateDocument(patch.value)
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
    if (!current() || selected.value?.scnid !== project.scnid) return
    // A failed byte transfer must retain its created candidate, never create another implicitly.
    versions.value = [version, ...versions.value]
    selected.value = { ...selected.value, candidateVersionId: version.id }
    const task = unwrapWorkshop(
      await ipcWorkshopUpload({
        selectionId: packageSelection.selectionId,
        versionId: version.id,
      }),
    )
    if (!current()) return
    transfers.accept(task)
    selection.value = null
    toast.add({ color: 'success', title: t('workshop.uploadStarted') })
  } catch (value) {
    if (!current()) return
    if (value instanceof AccountError && value.kind === 'conflict')
      await refreshQuotaConflict().catch(fail)
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
    <UAlert v-else-if="!allowed" :title="t('workshop.creatorRequired')" color="warning">
      <template #actions>
        <UButton to="/account?redirect=/creator">{{ t('workshop.account') }}</UButton>
      </template>
    </UAlert>
    <template v-else>
      <UProgress v-if="loading" />
      <UAlert v-if="error" :title="t(accountErrorKey(error))" color="error">
        <template #actions>
          <UButton @click="load">{{ t('workshop.reload') }}</UButton>
        </template>
      </UAlert>
      <div class="flex flex-wrap gap-2 items-center">
        <UButton
          v-for="project in projects"
          :key="project.scnid"
          :disabled="saving"
          :variant="selected?.scnid === project.scnid ? 'solid' : 'outline'"
          class="max-w-36"
          @click="edit(project)">
          <span class="truncate">{{ project.title }}</span>
        </UButton>
        <UButton :disabled="saving" variant="soft" @click="edit(null)">
          {{ t('workshop.create') }}
        </UButton>
      </div>
      <p v-if="!editing" class="text-sm text-muted">{{ t('workshop.creatorHint') }}</p>
      <p v-if="creator.quota" class="text-sm text-muted">
        {{
          t('workshop.quota', {
            projects: creator.quota.maxProjects,
            bytes: creator.quota.maxPackageBytes,
            storage: creator.quota.maxStorageBytes,
            used: creator.quota.usedStorageBytes,
          })
        }}
      </p>
      <UAlert v-if="creator.quotaError" :title="t('workshop.quotaError')" color="warning">
        <template #actions>
          <UButton :loading="creator.quotaLoading" @click="creator.loadQuota().catch(fail)">
            {{ t('workshop.reload') }}
          </UButton>
        </template>
      </UAlert>
      <div class="space-y-4">
        <UAlert
          v-if="conflict"
          :title="t('workshop.conflict')"
          :description="t('workshop.conflictHint')"
          color="warning">
          <template #actions>
            <UButton :loading="saving" @click="refreshSelected">
              {{ t('workshop.discardReload') }}
            </UButton>
          </template>
        </UAlert>
        <div v-if="selected" class="text-xs text-muted">
          SCNID {{ selected.scnid }} · {{ t('workshop.revision') }} {{ selected.contentRevision }} ·
          {{ selected.status }}
        </div>
        <UAlert :title="t('workshop.draftHint')" color="neutral" />
        <div v-if="!selected" class="flex gap-2">
          <UButton :disabled="saving || conflict" @click="choosePackage">
            {{ t('workshop.choosePackage') }}
          </UButton>
          <UButton v-if="selection" variant="outline" @click="prefill">
            {{ t('workshop.prefill') }}
          </UButton>
        </div>
        <UForm :schema="schema" :state="state" class="space-y-3" @submit="save">
          <div class="grid grid-cols-2 gap-3">
            <UFormField name="title" :label="t('workshop.projectTitle')" required>
              <UInput v-model="state.title" class="w-full" :maxlength="120" />
            </UFormField>
            <UFormField name="website" :label="t('workshop.website')">
              <UInput v-model="state.website" class="w-full" :maxlength="2048" />
            </UFormField>
          </div>
          <UFormField name="description" :label="t('workshop.description')">
            <UTextarea v-model="state.description" class="w-full" :rows="2" :maxlength="1000" />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              name="version"
              :label="t('workshop.displayVersion')"
              :description="t('workshop.displayVersionHint')">
              <UInput
                v-model="state.version"
                class="w-full"
                placeholder="1.0.0"
                :disabled="saving || conflict" />
            </UFormField>
            <UFormField name="tags" :label="t('workshop.tags')">
              <UInputTags v-model="state.tags" class="w-full" :disabled="saving || conflict" />
            </UFormField>
          </div>
          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">{{ t('workshop.localization') }}</legend>
            <p class="text-xs text-muted">{{ t('workshop.localizationHint') }}</p>
            <div
              v-for="(item, index) in state.localization"
              :key="index"
              class="space-y-2 border border-default rounded p-3">
              <div class="grid grid-cols-2 gap-2">
                <UFormField
                  :name="`localization.${index}.locale`"
                  :label="t('workshop.locale.locale')"
                  required>
                  <UInput v-model="item.locale" class="w-full" :disabled="saving || conflict" />
                </UFormField>
                <UFormField
                  v-for="field in ['name', 'author', 'version'] as const"
                  :key="field"
                  :name="`localization.${index}.${field}`"
                  :label="t(`workshop.locale.${field}`)">
                  <UInput v-model="item[field]" class="w-full" :disabled="saving || conflict" />
                </UFormField>
              </div>
              <UFormField :label="t('workshop.locale.description')">
                <UTextarea
                  v-model="item.description"
                  class="w-full"
                  :rows="2"
                  :disabled="saving || conflict" />
              </UFormField>
              <UFormField :label="t('workshop.locale.translators')">
                <UInputTags
                  :model-value="item.translators ?? []"
                  class="w-full"
                  :disabled="saving || conflict"
                  @update:model-value="item.translators = $event" />
              </UFormField>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :disabled="saving || conflict"
                @click="state.localization.splice(index, 1)">
                {{ t('workshop.removeLocalization') }}
              </UButton>
            </div>
            <UButton
              size="sm"
              variant="outline"
              :disabled="saving || conflict"
              @click="state.localization.push({ locale: '' })">
              {{ t('workshop.addLocalization') }}
            </UButton>
          </fieldset>
          <div class="space-y-2">
            <h3 class="text-sm font-medium">{{ t('workshop.changelog') }}</h3>
            <p class="text-xs text-muted">{{ t('workshop.displayChangelogHint') }}</p>
            <WorkshopEditor v-model="displayChangelog" basic :disabled="saving || conflict" />
          </div>
          <fieldset class="space-y-2">
            <legend class="text-sm font-medium">{{ t('contentMedia.ai.title') }}</legend>
            <p class="text-xs text-muted">{{ t('contentMedia.ai.editHint') }}</p>
            <div class="grid grid-cols-3 gap-3">
              <UFormField
                v-for="field in aiUsageFields"
                :key="field"
                :name="field"
                :label="t(`contentMedia.ai.${field}`)">
                <USelect
                  :model-value="
                    state[field] === true
                      ? 'used'
                      : state[field] === false
                        ? 'unused'
                        : 'undeclared'
                  "
                  :items="aiOptions"
                  :disabled="saving || conflict"
                  class="w-full"
                  @update:model-value="
                    state[field] = $event === 'used' ? true : $event === 'unused' ? false : null
                  " />
              </UFormField>
            </div>
          </fieldset>
          <div class="space-y-2">
            <p class="text-sm font-medium">{{ t('workshop.downloadLinks') }}</p>
            <p class="text-xs text-muted">{{ t('workshop.downloadLinksHint') }}</p>
            <div
              v-for="(link, index) in state.downloadLinks"
              :key="index"
              class="space-y-2 border border-default rounded p-2">
              <UFormField
                :name="`downloadLinks.${index}.url`"
                :label="t('workshop.downloadUrl')"
                required>
                <UInput v-model="link.url" class="w-full" :maxlength="2048" :disabled="saving" />
              </UFormField>
              <UFormField
                :name="`downloadLinks.${index}.description`"
                :label="t('workshop.downloadDescription')">
                <UTextarea
                  v-model="link.description"
                  class="w-full"
                  :rows="2"
                  :maxlength="500"
                  :disabled="saving" />
              </UFormField>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :disabled="saving"
                @click="state.downloadLinks.splice(index, 1)">
                {{ t('workshop.removeDownloadLink') }}
              </UButton>
            </div>
            <UButton
              size="sm"
              variant="outline"
              :disabled="saving || state.downloadLinks.length >= 3"
              @click="state.downloadLinks.push({ url: '', description: '' })">
              {{ t('workshop.addDownloadLink') }}
            </UButton>
          </div>
          <details class="text-sm">
            <summary class="cursor-pointer">{{ t('workshop.socialSponsor') }}</summary>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <UFormField v-for="key in socialKeys" :key="key" :name="`social.${key}`" :label="key">
                <UInput v-model="state.social[key]" class="w-full" :maxlength="2048" />
              </UFormField>
              <UFormField
                v-for="key in sponsorKeys"
                :key="key"
                :name="`sponsor.${key}`"
                :label="key">
                <UInput v-model="state.sponsor[key]" class="w-full" :maxlength="2048" />
              </UFormField>
            </div>
          </details>
          <div class="flex justify-between items-center">
            <span class="text-sm">{{ t('workshop.detail') }}</span>
            <UButton size="xs" variant="soft" :disabled="fileIds.length >= 50" @click="image">
              {{ t('workshop.uploadImage') }}
            </UButton>
          </div>
          <WorkshopEditor v-model="detail" :file-ids="fileIds" :disabled="saving || conflict" />
          <details v-if="fileIds.length" class="text-sm">
            <summary>{{ t('workshop.files') }} ({{ fileIds.length }}/50)</summary>
            <div v-for="id in fileIds" :key="id" class="flex items-center gap-2">
              <span class="font-mono text-xs truncate">{{ id }}</span>
              <UButton
                size="xs"
                color="neutral"
                variant="link"
                :disabled="documentFileIds(detail).includes(id)"
                @click="fileIds = fileIds.filter((item) => item !== id)">
                {{ t('workshop.removeReference') }}
              </UButton>
            </div>
          </details>
          <UButton type="submit" :loading="saving" :disabled="conflict">
            {{ t('workshop.saveDraft') }}
          </UButton>
        </UForm>
        <WorkshopReviewModeration v-if="selected" :scnid="selected.scnid" />
        <UCard v-if="selected" :ui="{ body: 'space-y-3 p-3' }">
          <h2 class="font-semibold">{{ t('workshop.versions') }}</h2>
          <p class="text-sm text-muted">{{ t('workshop.versionHint') }}</p>
          <div
            v-for="version in versions"
            :key="version.id"
            class="border-b border-default pb-2 space-y-1">
            <div class="flex justify-between items-center gap-2">
              <span class="text-sm break-all">
                {{ version.version }} · {{ version.status }} · {{ version.scanStatus }}
              </span>
              <UButton
                v-if="
                  selected.candidateVersionId === version.id &&
                  ['DRAFT', 'PENDING_REVIEW'].includes(version.status)
                "
                size="xs"
                color="warning"
                variant="outline"
                @click="cancelId = version.id">
                {{ t('workshop.cancelCandidate') }}
              </UButton>
            </div>
            <AiUsageDetails :value="version.manifest" />
            <WorkshopRichText :document="version.patch" />
          </div>
          <UAlert
            v-if="selected.candidateVersionId"
            :title="t('workshop.candidateOccupied')"
            color="warning" />
          <div class="flex gap-2">
            <UButton
              :disabled="saving || conflict || !!selected.candidateVersionId"
              @click="choosePackage">
              {{ t('workshop.choosePackage') }}
            </UButton>
            <UButton v-if="selection" variant="outline" @click="prefill">
              {{ t('workshop.prefill') }}
            </UButton>
          </div>
          <template v-if="selection">
            <p class="text-sm break-all">
              {{ selection.name }} · {{ selection.size }} bytes · {{ selection.manifest.version }}
            </p>
            <UAlert v-if="!packageValid" :title="t('workshop.invalidVersion')" color="error" />
            <AiUsageDetails :value="selection.manifest" />
            <p class="text-xs text-muted break-all">SHA-256 {{ selection.sha256 }}</p>
            <details>
              <summary class="text-sm cursor-pointer">{{ t('workshop.manifest') }}</summary>
              <pre class="text-xs whitespace-pre-wrap break-all max-h-48 overflow-y-auto">{{
                JSON.stringify(selection.manifest, null, 2)
              }}</pre>
            </details>
            <p class="text-sm">{{ t('workshop.patch') }}</p>
            <WorkshopEditor v-model="patch" :file-ids="selected.fileIds" :disabled="saving" />
            <UButton
              :loading="saving"
              :disabled="!packageValid || conflict || !!selected.candidateVersionId"
              @click="upload">
              {{ t('workshop.createUpload') }}
            </UButton>
          </template>
        </UCard>
      </div>
    </template>
    <UModal
      :open="!!importPreview"
      :title="t('workshop.importTitle')"
      :description="t('workshop.importHint')"
      :ui="{ content: 'sm:max-w-3xl', body: 'max-h-[55vh] overflow-y-auto' }"
      @update:open="
        (value: boolean) => {
          if (!value) importPreview = null
        }
      ">
      <template #body>
        <UAlert
          v-if="importWarning"
          :title="t('workshop.importWarning')"
          color="warning"
          class="mb-3" />
        <div
          v-for="(value, key) in importPreview"
          :key="key"
          class="border-b border-default py-3 space-y-2">
          <UCheckbox
            :model-value="importFields.includes(String(key))"
            :label="importLabel(String(key))"
            @update:model-value="
              (checked: boolean | 'indeterminate') => {
                importFields = checked
                  ? [...new Set([...importFields, String(key)])]
                  : importFields.filter((field) => field !== String(key))
              }
            " />
          <div class="grid grid-cols-2 gap-3 text-xs min-w-0">
            <div class="min-w-0">
              <p class="text-muted">{{ t('workshop.importCurrent') }}</p>
              <pre class="whitespace-pre-wrap break-all max-h-28 overflow-auto">{{
                importText(String(key), currentImportValue(String(key)))
              }}</pre>
            </div>
            <div class="min-w-0">
              <p class="text-muted">{{ t('workshop.importPackage') }}</p>
              <pre class="whitespace-pre-wrap break-all max-h-28 overflow-auto">{{
                importText(String(key), value)
              }}</pre>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="outline" @click="importPreview = null">
          {{ t('workshop.cancel') }}
        </UButton>
        <UButton :disabled="!importFields.length || saving || conflict" @click="applyPrefill">
          {{ t('workshop.applyImport') }}
        </UButton>
      </template>
    </UModal>
    <UModal
      :open="!!cancelId"
      :title="t('workshop.cancelCandidate')"
      :description="t('workshop.cancelCandidateHint')"
      @update:open="
        (value: boolean) => {
          if (!value) cancelId = null
        }
      ">
      <template #footer>
        <UButton color="neutral" variant="outline" @click="cancelId = null">
          {{ t('workshop.back') }}
        </UButton>
        <UButton color="warning" :loading="saving" @click="cancelCandidate">
          {{ t('workshop.confirm') }}
        </UButton>
      </template>
    </UModal>
  </section>
</template>
