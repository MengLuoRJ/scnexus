<script lang="ts" setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { sampleReplayObserverAnalysis, summarizeReplayObserverUnits } from '@scnexus/sc2-observer'
import type { ReplayObserverUnit } from '@scnexus/sc2-observer'
import type { ReplayAnalysis } from '@scnexus/app-shared/types/replay.type'
import { replayObserverPlayerName } from './display'
import { replayGameTime } from './insights'

defineOptions({ name: 'ReplayObserverAnalysis' })
const props = defineProps<{
  insights?: ReplayAnalysis['insights']
  timeline: ReplayAnalysis['spatial']
  units: readonly ReplayObserverUnit[]
  gameLoop: number
  partial?: boolean
}>()
const emit = defineEmits<{
  seek: [gameLoop: number]
  selectEvent: [unitTag: string, gameLoop: number]
}>()
const { t } = useI18n()
const snapshots = computed(() =>
  sampleReplayObserverAnalysis(props.insights ?? { players: [] }, props.gameLoop),
)
const summaries = computed(() => summarizeReplayObserverUnits(props.units))
const playerIds = computed(() =>
  [
    ...new Set([
      ...(props.insights?.players.map((player) => player.playerId) ?? []),
      ...summaries.value.map((player) => player.playerId),
    ]),
  ].sort((a, b) => (a ?? -1) - (b ?? -1)),
)
function playerName(id: number | null) {
  return replayObserverPlayerName(
    props.insights?.players ?? [],
    id,
    id === null
      ? t('replay.unknown')
      : id === 0
        ? t('replay.observer.neutral')
        : t('replay.observer.player', { id }),
  )
}
function display(value: number | null | undefined) {
  return value == null ? t('replay.unknown') : value
}
const currentUnits = computed(() => new Map(props.units.map((unit) => [unit.unitTag, unit])))
const recentDeaths = computed(() => {
  const groups = new Map<number | null, { unitTag: string; gameLoop: number; name: string }[]>()
  const tracks = (props.timeline?.units ?? [])
    .filter((unit) => unit.diedGameLoop !== null && unit.diedGameLoop <= props.gameLoop)
    .sort((a, b) => b.diedGameLoop! - a.diedGameLoop!)
  for (const track of tracks) {
    const unit = currentUnits.value.get(track.unitTag)
    if (!unit) continue
    const group = groups.get(unit.controlPlayerId) ?? []
    if (group.length < 5)
      group.push({
        unitTag: unit.unitTag,
        gameLoop: track.diedGameLoop!,
        name: unit.unitType ?? t('replay.unknown'),
      })
    groups.set(unit.controlPlayerId, group)
  }
  return groups
})
const players = computed(() =>
  playerIds.value.map((id) => ({
    id,
    name: playerName(id),
    summary: summaries.value.find((player) => player.playerId === id),
    snapshot: snapshots.value.find((player) => player.playerId === id),
    deaths: recentDeaths.value.get(id) ?? [],
  })),
)
</script>

<template>
  <details
    class="rounded-lg border border-default p-3"
    :aria-label="t('replay.observer.analysis.title')">
    <summary class="cursor-pointer text-xs font-medium">
      {{ t('replay.observer.analysis.title') }}
    </summary>
    <p class="mt-2 text-xs text-muted">{{ t('replay.observer.analysis.notice') }}</p>
    <p v-if="props.partial" class="mt-1 text-xs text-warning">
      {{ t('replay.observer.analysis.partial') }}
    </p>
    <p v-if="!players.length" class="mt-2 text-xs text-muted">
      {{ t('replay.observer.analysis.empty') }}
    </p>
    <div class="mt-3 grid min-w-0 grid-cols-2 gap-3">
      <section
        v-for="player in players"
        :key="player.id ?? 'unknown'"
        class="min-w-0 rounded-lg bg-muted/40 p-3 text-xs"
        :aria-label="player.name">
        <h4 class="break-words font-medium">{{ player.name }}</h4>
        <p class="mt-2 text-muted">
          {{
            t('replay.observer.analysis.entities', {
              alive: player.summary?.alive ?? 0,
              dead: player.summary?.dead ?? 0,
              building: player.summary?.underConstruction ?? 0,
            })
          }}
        </p>
        <template v-if="player.snapshot?.economy">
          <button
            class="mt-2 text-left text-muted hover:underline"
            @click="emit('seek', player.snapshot.economy.gameLoop)">
            {{
              t('replay.observer.analysis.sample', {
                loop: player.snapshot.economy.gameLoop,
                age: Math.floor(player.snapshot.economyAgeGameLoops ?? 0),
              })
            }}
          </button>
          <dl class="mt-2 grid grid-cols-2 gap-2 break-words">
            <div>
              <dt class="text-muted">{{ t('replay.observer.analysis.minerals') }}</dt>
              <dd>{{ display(player.snapshot.economy.minerals) }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ t('replay.observer.analysis.vespene') }}</dt>
              <dd>{{ display(player.snapshot.economy.vespene) }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ t('replay.observer.analysis.workers') }}</dt>
              <dd>{{ display(player.snapshot.economy.workers) }}</dd>
            </div>
            <div>
              <dt class="text-muted">{{ t('replay.observer.analysis.supply') }}</dt>
              <dd>
                {{ display(player.snapshot.economy.supplyUsed) }} /
                {{ display(player.snapshot.economy.supplyCap) }}
              </dd>
            </div>
            <div class="col-span-2">
              <dt class="text-muted">{{ t('replay.observer.analysis.armyLoss') }}</dt>
              <dd>
                {{ display(player.snapshot.economy.lostArmyMinerals) }} /
                {{ display(player.snapshot.economy.lostArmyVespene) }}
              </dd>
            </div>
          </dl>
        </template>
        <p v-else class="mt-2 text-muted">{{ t('replay.observer.analysis.noSample') }}</p>
        <h5 class="mt-3 font-medium">{{ t('replay.observer.analysis.production') }}</h5>
        <ul v-if="player.snapshot?.production.length" class="mt-1 space-y-1">
          <li
            v-for="(event, index) in player.snapshot.production"
            :key="`${event.observationGameLoop}-${index}`">
            <button
              class="w-full break-words text-left hover:underline"
              @click="emit('seek', event.observationGameLoop)">
              {{ replayGameTime(event.observationGameLoop) }} ({{ event.observationGameLoop }}) ·
              {{ t(`replay.production.${event.kind}`) }} ·
              {{ event.name }}
            </button>
          </li>
        </ul>
        <p v-else class="mt-1 text-muted">{{ t('replay.observer.analysis.noProduction') }}</p>
        <h5 class="mt-3 font-medium">{{ t('replay.observer.analysis.deaths') }}</h5>
        <ul v-if="player.deaths.length" class="mt-1 space-y-1">
          <li v-for="event in player.deaths" :key="event.unitTag">
            <button
              class="w-full break-words text-left hover:underline"
              @click="emit('selectEvent', event.unitTag, event.gameLoop)">
              {{ replayGameTime(event.gameLoop) }} ({{ event.gameLoop }}) · {{ event.name }} · #{{
                event.unitTag
              }}
            </button>
          </li>
        </ul>
        <p v-else class="mt-1 text-muted">{{ t('replay.observer.analysis.noDeaths') }}</p>
      </section>
    </div>
  </details>
</template>
