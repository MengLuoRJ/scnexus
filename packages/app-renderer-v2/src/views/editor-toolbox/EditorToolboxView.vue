<script lang="ts" setup>
import { useI18n } from 'vue-i18n'
import toolIcon from '../../assets/menu/Menu_Customize_Test.png'
defineOptions({ name: 'EditorToolboxView' })
const { t } = useI18n()
</script>
<template>
  <section class="space-y-3">
    <p class="text-sm text-muted">{{ t('toolbox.intro') }}</p>
    <div class="grid grid-cols-3 gap-3">
      <UButton
        to="/editor-toolbox/encoding"
        color="neutral"
        variant="outline"
        class="flex flex-col items-center gap-3 p-5 text-center"
      >
        <img :src="toolIcon" alt="" draggable="false" class="size-14 object-contain" />
        <span class="font-semibold">{{ t('toolbox.encoding') }}</span>
        <span class="whitespace-normal text-xs font-normal text-muted">{{
          t('toolbox.encodingHint')
        }}</span>
      </UButton>
    </div>
  </section>
</template>
