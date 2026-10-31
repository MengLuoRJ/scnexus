<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ReplayAnalysis,
  ReplayJson,
  ReplayRecord,
} from '@scnexus/app-shared/types/replay.type'

defineOptions({ name: 'ReplayAnalysisDialog' })
const props = defineProps<{
  record: ReplayRecord
  analysis: ReplayAnalysis | null
  loaded: boolean
  busy: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; analyze: []; delete: [] }>()
const { t, locale } = useI18n()
function localTime(value: string | number | null) {
  return value === null ? t('replay.unknown') : new Date(value).toLocaleString(locale.value)
}
function raceLabel(race: string | null) {
  if (!race) return t('replay.unknown')
  const normalized = race.toLowerCase()
  return ['terran', 'zerg', 'protoss', 'random'].includes(normalized)
    ? t(`replay.race.${normalized}`)
    : race
}
const component = ref<'initData' | 'attributes' | 'tracker'>('tracker')
const page = ref(0)
const size = 20
function field(value: ReplayJson | undefined, key: string): ReplayJson | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value[key] : undefined
}
const value = computed(() => props.analysis?.components[component.value])
const items = computed(() => {
  const list = field(value.value, component.value === 'tracker' ? 'events' : 'attributes')
  return Array.isArray(list) ? list : []
})
const visible = computed(() => items.value.slice(page.value * size, (page.value + 1) * size))
const pageCount = computed(() => Math.max(1, Math.ceil(items.value.length / size)))
const eventCounts = computed(() => {
  const events = field(props.analysis?.components.tracker ?? undefined, 'events')
  const counts = new Map<string, number>()
  if (Array.isArray(events))
    for (const event of events) {
      const type = field(event, 'eventType')
      if (typeof type === 'string') counts.set(type, (counts.get(type) ?? 0) + 1)
    }
  return [...counts].map(([type, count]) => ({ type, count }))
})
function preview(data: ReplayJson | undefined): string {
  const text = JSON.stringify(data ?? null, null, 2)
  return text.length > 12_000 ? `${text.slice(0, 12_000)}\n… ${t('replay.previewTruncated')}` : text
}
function label(item: ReplayJson, index: number): string {
  const type = field(item, 'eventType')
  const loop = field(item, 'gameLoop')
  if (typeof type === 'string')
    return `${page.value * size + index + 1}. ${type} · ${t('replay.gameLoop')}: ${String(loop ?? '?')}`
  return `${page.value * size + index + 1}. ${t('replay.attributeId')}: ${String(field(item, 'attributeId') ?? '?')}`
}
watch([component, () => props.analysis], () => {
  page.value = 0
})
</script>

<template>
  <UModal
    :open="true"
    :dismissible="!props.busy"
    :title="t('replay.details')"
    :description="props.record.fileName"
    :ui="{
      content: 'max-w-3xl max-h-[85vh]',
      description: 'break-all',
      body: 'min-h-0 overflow-y-auto',
      footer: 'flex-wrap',
    }"
    @update:open="!$event && !props.busy && emit('close')">
    <template #body>
      <div class="min-w-0 space-y-3 text-sm">
        <dl class="grid min-w-0 grid-cols-2 gap-3">
          <div class="col-span-2 min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.path') }}</dt>
            <dd class="break-all">{{ props.record.path }}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.map') }}</dt>
            <dd class="break-words">{{ props.record.mapName ?? t('replay.unknown') }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.playedAt') }}</dt>
            <dd>{{ localTime(props.record.playedAt) }}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-muted">{{ t('replay.version') }}</dt>
            <dd class="break-words">{{ props.record.gameVersion ?? t('replay.unknown') }}</dd>
            <dd>
              {{ t('replay.baseBuild') }}: {{ props.record.baseBuild ?? t('replay.unknown') }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.duration') }}</dt>
            <dd>
              {{
                props.record.durationSeconds === null
                  ? t('replay.unknown')
                  : `${Math.floor(props.record.durationSeconds / 60)}:${String(Math.floor(props.record.durationSeconds % 60)).padStart(2, '0')}`
              }}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.size') }}</dt>
            <dd>{{ (props.record.sizeBytes / 1024).toFixed(1) }} KiB</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.modifiedAt') }}</dt>
            <dd>{{ localTime(props.record.mtimeMs) }}</dd>
          </div>
          <div>
            <dt class="text-xs text-muted">{{ t('replay.statusLabel') }}</dt>
            <dd>
              {{ t(`replay.status.${props.record.status}`) }} ·
              {{ t(`replay.support.${props.record.supportLevel}`) }}
            </dd>
          </div>
        </dl>
        <section :aria-label="t('replay.players')">
          <h3 class="text-xs text-muted">{{ t('replay.players') }}</h3>
          <p v-if="!props.record.players.length">{{ t('replay.unknown') }}</p>
          <ul v-else class="space-y-1">
            <li v-for="player in props.record.players" :key="player.slot" class="break-all">
              <span class="font-medium">{{ player.name ?? t('replay.unknown') }}</span>
              · {{ t('replay.race') }}: {{ raceLabel(player.race) }} · {{ t('replay.team') }}:
              {{ player.team ?? t('replay.unknown') }} · {{ t('replay.result') }}:
              {{ player.result ? t(`replay.result.${player.result}`) : t('replay.unknown') }}
            </li>
          </ul>
        </section>
        <p v-if="props.record.supportLevel !== 'full'" class="text-xs text-warning">
          {{ t('replay.partialNotice') }}
        </p>
        <ul
          v-if="props.record.warnings.length"
          class="list-inside list-disc break-words text-xs text-warning">
          <li v-for="(warning, index) in props.record.warnings" :key="index">{{ warning }}</li>
        </ul>
        <h3 class="font-medium">{{ t('replay.analysisDetails') }}</h3>
        <p class="text-warning">{{ t('replay.analysisNotice') }}</p>
        <p v-if="props.busy" role="status">{{ t('replay.busy') }}</p>
        <p v-if="props.error" role="alert" class="break-words text-error">{{ props.error }}</p>
        <p v-else-if="props.loaded && !props.analysis">{{ t('replay.noAnalysis') }}</p>
        <template v-if="props.analysis">
          <dl class="grid grid-cols-2 gap-2">
            <div>
              <dt class="text-xs text-muted">{{ t('replay.analysisStatusLabel') }}</dt>
              <dd>{{ t(`replay.analysisStatus.${props.analysis.status}`) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">{{ t('replay.analyzedAt') }}</dt>
              <dd>{{ props.analysis.analyzedAt }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">{{ t('replay.parserVersion') }}</dt>
              <dd>{{ props.analysis.parserVersion }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">{{ t('replay.baseBuild') }}</dt>
              <dd>{{ props.analysis.baseBuild ?? t('replay.unknown') }}</dd>
            </div>
          </dl>
          <p class="break-all text-xs text-muted">SHA-256: {{ props.analysis.contentHash }}</p>
          <ul
            v-if="props.analysis.warnings.length"
            class="list-inside list-disc break-words text-warning">
            <li v-for="(warning, index) in props.analysis.warnings" :key="index">{{ warning }}</li>
          </ul>
          <div class="flex items-center gap-2" :aria-label="t('replay.components')">
            <UButton
              v-for="key in ['initData', 'attributes', 'tracker'] as const"
              :key="key"
              size="xs"
              :variant="component === key ? 'solid' : 'outline'"
              :label="t(`replay.component.${key}`)"
              @click="component = key" />
          </div>
          <p v-if="value == null" class="text-muted">{{ t('replay.componentUnavailable') }}</p>
          <template v-else>
            <p class="break-all text-xs text-muted">
              {{ t('replay.protocolVersion') }}:
              {{ field(value, 'protocolVersion') ?? t('replay.unknown') }} ·
              {{ t('replay.algorithmVersion') }}:
              {{ field(value, 'algorithmVersion') ?? t('replay.unknown') }}
            </p>
            <template v-if="component === 'initData'">
              <details>
                <summary class="cursor-pointer">{{ t('replay.rawPreview') }}</summary>
                <pre
                  class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-elevated p-2 text-xs"
                  >{{ preview(value) }}</pre>
              </details>
            </template>
            <template v-else>
              <p>{{ t('replay.itemCount', { count: items.length }) }}</p>
              <details v-if="component === 'tracker' && eventCounts.length">
                <summary class="cursor-pointer">{{ t('replay.eventCounts') }}</summary>
                <ul class="mt-1 space-y-1 text-xs">
                  <li v-for="entry in eventCounts" :key="entry.type" class="break-all">
                    {{ entry.type }}: {{ entry.count }}
                  </li>
                </ul>
              </details>
              <p v-if="!items.length" class="text-muted">{{ t('replay.noItems') }}</p>
              <details
                v-for="(item, index) in visible"
                :key="`${component}-${page}-${index}`"
                class="min-w-0 rounded border border-default p-2">
                <summary class="cursor-pointer break-all text-xs">{{ label(item, index) }}</summary>
                <pre
                  class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all bg-elevated p-2 text-xs"
                  >{{ preview(item) }}</pre>
              </details>
              <div v-if="items.length" class="flex items-center gap-2">
                <UButton
                  :disabled="page === 0"
                  size="xs"
                  variant="outline"
                  :label="t('replay.previous')"
                  @click="page--" />
                <span>{{ page + 1 }} / {{ pageCount }}</span>
                <UButton
                  :disabled="page + 1 >= pageCount"
                  size="xs"
                  variant="outline"
                  :label="t('replay.next')"
                  @click="page++" />
              </div>
            </template>
          </template>
        </template>
      </div>
    </template>
    <template #footer>
      <UButton
        :disabled="props.busy"
        color="error"
        variant="outline"
        :label="t('replay.delete')"
        @click="emit('delete')" />
      <UButton
        :disabled="props.busy"
        :label="t(props.analysis ? 'replay.reanalyze' : 'replay.analyze')"
        @click="emit('analyze')" />
      <UButton
        :disabled="props.busy"
        variant="outline"
        :label="t('replay.close')"
        @click="emit('close')" />
    </template>
  </UModal>
</template>
