<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ReplayAnalysis,
  ReplayComponentCapability,
} from '@scnexus/app-shared/types/replay.type'
import { replayPlayerName } from './display'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayChat' })
const props = defineProps<{
  chat?: ReplayAnalysis['chat']
  capability?: ReplayComponentCapability
}>()
const { t } = useI18n()
const page = ref(0)
const pageSize = ref(20)
const sizes = [20, 50]
const messages = computed(() => props.chat?.messages ?? [])
const visible = computed(() =>
  messages.value.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value),
)
const pageCount = computed(() => Math.max(1, Math.ceil(messages.value.length / pageSize.value)))
watch([() => props.chat, pageSize], () => {
  page.value = 0
})
</script>

<template>
  <section
    class="min-w-0 space-y-3 rounded-xl border border-default bg-default p-4"
    :aria-label="t('replay.chat.title')">
    <div class="flex items-center justify-between gap-3">
      <h4 class="font-medium">{{ t('replay.chat.title') }}</h4>
      <span class="text-xs text-muted">{{ t('replay.chat.gameTime') }}</span>
    </div>
    <p v-if="!messages.length && props.chat?.state !== 'available'" class="text-muted">
      {{ t('replay.analysisFailed') }}
    </p>
    <template v-else>
      <p v-if="!messages.length" class="text-muted">{{ t('replay.chat.empty') }}</p>
      <template v-else>
        <ol class="min-w-0 overflow-hidden rounded-lg border border-default">
          <li
            v-for="(message, index) in visible"
            :key="page * pageSize + index"
            class="min-w-0 space-y-1 px-3 py-2.5 odd:bg-muted/40">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
              <span class="shrink-0 font-mono tabular-nums text-muted">
                {{ replayGameTime(message.gameLoop) }}
              </span>
              <span class="min-w-0 font-medium [overflow-wrap:anywhere]">
                {{ replayPlayerName(message.name, t('replay.unknown')) }}
              </span>
            </div>
            <p class="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{{ message.text }}</p>
          </li>
        </ol>
        <div class="flex flex-wrap items-center justify-end gap-3 text-xs tabular-nums">
          <label class="flex items-center gap-2">
            <span>{{ t('replay.chat.pageSize') }}</span>
            <USelect
              :model-value="pageSize"
              :items="sizes"
              :aria-label="t('replay.chat.pageSize')"
              size="xs"
              @update:model-value="pageSize = Number($event)" />
          </label>
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
  </section>
</template>
