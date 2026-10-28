<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import type { InstallPreview } from '@scnexus/app-shared/types/content.type'
defineOptions({ name: 'ContentLauncherChoice' })
const props = defineProps<{ preview: InstallPreview; disabled?: boolean }>()
const target = defineModel<string | null>({ required: true })
const { t } = useI18n()
</script>
<template>
  <div
    v-if="props.preview.package.type === 'customize' && props.preview.launcher"
    class="space-y-2 rounded border border-default p-3 text-sm"
  >
    <p class="font-medium">{{ t('customize.launcher') }}</p>
    <template v-if="props.preview.launcher.source === 'manifest'">
      <p class="text-xs text-muted">{{ t('customize.launcherManifest') }}</p>
      <p class="break-all">{{ props.preview.launcher.target }}</p>
    </template>
    <template v-else>
      <p class="text-xs text-muted">
        {{
          t(
            props.preview.launcher.source === 'detected'
              ? 'customize.launcherDetected'
              : 'customize.launcherMissing',
          )
        }}
      </p>
      <USelect
        :model-value="target ?? '__none__'"
        :disabled="props.disabled"
        class="w-full"
        :aria-label="t('customize.launcher')"
        :items="[
          { label: t('customize.launcherNone'), value: '__none__' },
          ...props.preview.launcher.candidates.map((item) => ({
            label: item.target,
            value: item.target,
          })),
        ]"
        @update:model-value="(value: string) => (target = value === '__none__' ? null : value)"
      />
    </template>
  </div>
</template>
