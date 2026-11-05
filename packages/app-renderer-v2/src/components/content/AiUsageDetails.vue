<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import { aiUsageFields, type AiUsage } from '../../utils/ai-usage'
defineOptions({ name: 'ContentAiUsageDetails' })
const props = defineProps<{ value: AiUsage }>()
const { t } = useI18n()
</script>
<template>
  <section class="space-y-2 min-w-0" :aria-label="t('contentMedia.ai.title')">
    <h3 class="text-sm font-medium">{{ t('contentMedia.ai.title') }}</h3>
    <dl class="grid grid-cols-3 gap-3 text-sm">
      <div v-for="field in aiUsageFields" :key="field" class="min-w-0">
        <dt class="text-muted break-words">{{ t(`contentMedia.ai.${field}`) }}</dt>
        <dd>
          {{
            t(
              props.value[field] === true
                ? 'contentMedia.ai.used'
                : props.value[field] === false
                  ? 'contentMedia.ai.unused'
                  : 'contentMedia.ai.undeclared',
            )
          }}
        </dd>
      </div>
    </dl>
    <p class="text-xs text-muted">{{ t('contentMedia.ai.disclaimer') }}</p>
  </section>
</template>
