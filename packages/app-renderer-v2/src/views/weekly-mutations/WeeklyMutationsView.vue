<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useToast } from '@nuxt/ui/composables/useToast'
import { mutationRegions } from '../../apis/weekly-mutations'
import type { MutationMap } from '../../apis/weekly-mutations'
import { useWeeklyMutations } from './useWeeklyMutations'
import MutatorIcon from './components/MutatorIcon.vue'
defineOptions({ name: 'WeeklyMutationsView' })
const { t, locale } = useI18n()
const toast = useToast()
const tab = ref('weekly')
const search = ref('')
const {
  region,
  language,
  weekly,
  catalog,
  current,
  expired,
  weeklyLoading,
  catalogLoading,
  weeklyError,
  catalogError,
  loadWeekly,
  loadCatalog,
} = useWeeklyMutations(() => {
  toast.add({ id: 'weekly-load-failed', title: t('weekly.loadFailed'), color: 'error' })
})
const tabs = computed(() => [
  { label: t('weekly.current'), value: 'weekly' },
  { label: t('weekly.mutators'), value: 'mutators' },
])
watch(
  locale,
  (value) => {
    language.value = value === 'en' ? 'enUS' : 'zhCN'
  },
  { immediate: true },
)
const regions = computed(() =>
  mutationRegions.map((value) => ({ value, label: t(`weekly.region.${value}`) })),
)
function name(value: MutationMap) {
  return value.displayName || value.name[language.value] || value.name.enUS || value.name.zhCN
}
const factors = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return (catalog.value?.items ?? []).filter(
    (item) =>
      !query ||
      [...Object.values(item.name), item.description].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
  )
})
function date(value: string) {
  return new Intl.DateTimeFormat(
    locale.value === 'en' ? 'en-US' : locale.value === 'zh-Hant' ? 'zh-TW' : 'zh-CN',
    {
      timeZoneName: 'short',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
  ).format(new Date(value))
}
</script>
<template>
  <section class="mutation-theme min-w-0 space-y-3">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <UTabs v-model="tab" :items="tabs" :content="false" size="sm" />
        <UTabs
          v-if="tab === 'weekly'"
          v-model="region"
          :items="regions"
          :content="false"
          size="sm"
          class="w-fit"
          :aria-label="t('weekly.serverLabel')" />
      </div>
      <UButton
        size="sm"
        color="neutral"
        variant="outline"
        :loading="tab === 'weekly' ? weeklyLoading : catalogLoading"
        @click="tab === 'weekly' ? loadWeekly() : loadCatalog()">
        {{ t('weekly.refresh') }}
      </UButton>
    </div>
    <template v-if="tab === 'weekly'">
      <div v-if="weeklyLoading && !weekly" role="status" class="space-y-2">
        <p class="text-sm text-muted">{{ t('weekly.loading') }}</p>
        <UProgress />
      </div>
      <UAlert
        v-else-if="weeklyError"
        color="neutral"
        variant="subtle"
        :title="t('weekly.loadFailed')"
        :description="t('weekly.retryHint')" />
      <template v-else-if="current">
        <div class="mutation-brief space-y-2 rounded-lg border p-4">
          <div class="flex items-center gap-2">
            <h2 class="min-w-0 break-words text-lg font-semibold">
              {{ name(current.mutation) }}
            </h2>
            <UBadge
              class="shrink-0"
              :color="current.dataStatus === 'verified' ? 'success' : 'neutral'"
              variant="subtle">
              {{ t(`weekly.${current.dataStatus}`) }}
            </UBadge>
          </div>
          <p class="text-sm">{{ t('weekly.map') }}：{{ name(current.mutation.map) }}</p>
          <p class="text-xs text-muted">
            {{ date(current.startsAt) }} — {{ date(current.endsAt) }}
          </p>
          <p v-if="current.mutation.description" class="whitespace-pre-wrap break-words text-sm">
            {{ current.mutation.description }}
          </p>
          <p v-if="current.dataStatus === 'verified'" class="text-xs text-muted">
            {{ t('weekly.verifiedHint') }}
          </p>
          <p v-if="current.lastVerifiedAt" class="text-xs text-muted">
            {{ t('weekly.lastVerified') }}：{{ date(current.lastVerifiedAt) }}
          </p>
        </div>
        <h3 class="text-sm font-semibold">{{ t('weekly.activeMutators') }}</h3>
        <div class="grid grid-cols-2 items-stretch gap-3">
          <article
            v-for="factor in current.mutation.mutators"
            :key="factor.id"
            class="mutation-factor flex min-w-0 items-start gap-3 rounded-lg border p-3">
            <MutatorIcon :id="factor.id" />
            <div class="min-w-0 space-y-1">
              <h4 class="break-words font-medium text-primary">{{ name(factor) }}</h4>
              <p class="whitespace-pre-wrap break-words text-sm text-muted">
                {{ factor.description }}
              </p>
            </div>
          </article>
        </div>
      </template>
      <UAlert
        v-else-if="weekly"
        color="neutral"
        variant="subtle"
        :title="t(expired ? 'weekly.expired' : 'weekly.noSchedule')"
        :description="
          t(
            expired
              ? 'weekly.expiredHint'
              : !weekly.available && weekly.reason === 'OUTSIDE_VALIDITY'
                ? 'weekly.outsideValidity'
                : 'weekly.noScheduleHint',
          )
        " />
    </template>
    <template v-else>
      <div class="flex items-center justify-between gap-3">
        <UInput
          v-model="search"
          class="w-72"
          :placeholder="t('weekly.search')"
          :aria-label="t('weekly.search')" />
        <span class="shrink-0 text-xs text-muted">
          {{ t('weekly.count', { count: factors.length }) }}
        </span>
      </div>
      <div v-if="catalogLoading && !catalog" role="status" class="space-y-2">
        <p class="text-sm text-muted">{{ t('weekly.loading') }}</p>
        <UProgress />
      </div>
      <UAlert
        v-else-if="catalogError"
        color="neutral"
        variant="subtle"
        :title="t('weekly.loadFailed')"
        :description="t('weekly.retryHint')" />
      <UAlert
        v-else-if="!factors.length"
        color="neutral"
        variant="subtle"
        :title="t(search.trim() ? 'weekly.noMatches' : 'weekly.emptyCatalog')" />
      <div v-else class="grid grid-cols-2 items-stretch gap-3">
        <article
          v-for="factor in factors"
          :key="factor.id"
          class="mutation-factor flex min-w-0 items-start gap-3 rounded-lg border p-3">
          <MutatorIcon :id="factor.id" />
          <div class="min-w-0 space-y-1">
            <h3 class="break-words font-medium text-primary">{{ name(factor) }}</h3>
            <p v-if="factor.name.enUS && locale !== 'en'" class="break-words text-xs text-muted">
              {{ factor.name.enUS }}
            </p>
            <p class="whitespace-pre-wrap break-words text-sm text-muted">
              {{ factor.description }}
            </p>
            <p
              v-if="factor.communityScore !== undefined && factor.communityScore >= 0"
              class="text-xs text-muted">
              {{ t('weekly.score') }}：{{ factor.communityScore }}
            </p>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>

<style scoped>
.mutation-theme {
  --ui-primary: var(--color-lime-700);
  --mutation-glow: var(--color-lime-500);
}
:global(.dark) .mutation-theme {
  --ui-primary: var(--color-lime-400);
}
.mutation-brief {
  border-color: color-mix(in srgb, var(--mutation-glow) 45%, var(--ui-border));
  background:
    radial-gradient(
      ellipse at top right,
      color-mix(in srgb, var(--mutation-glow) 16%, transparent),
      transparent 70%
    ),
    var(--ui-bg-elevated);
  box-shadow: inset 3px 0 0 var(--ui-primary);
}
.mutation-brief h2 {
  color: var(--ui-primary);
}
.mutation-factor {
  border-color: color-mix(in srgb, var(--mutation-glow) 28%, var(--ui-border));
  background:
    linear-gradient(120deg, color-mix(in srgb, var(--mutation-glow) 6%, transparent), transparent),
    var(--ui-bg);
}
</style>
