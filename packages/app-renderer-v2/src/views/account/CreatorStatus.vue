<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { z } from 'zod'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useCreatorStore } from '../../stores/creator'
import { useContentCenterStore } from '../../stores/content-center'
import { accountErrorKey } from '../../apis'
defineOptions({ name: 'AccountCreatorStatus' })
const creator = useCreatorStore()
const content = useContentCenterStore()
const { t } = useI18n()
const toast = useToast()
const open = ref(false)
const code = ref('')
const codeError = ref('')
const schema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)
const status = computed(() => creator.state?.state ?? 'UNKNOWN')
onMounted(() => {
  if (content.enabled) void creator.load()
})
function close() {
  open.value = false
  code.value = ''
}
async function redeem() {
  if (creator.loading) return
  const result = schema.safeParse(code.value)
  if (!result.success) {
    codeError.value = t('creatorActivation.invalid')
    return
  }
  codeError.value = ''
  try {
    await creator.redeem(result.data)
    code.value = ''
    open.value = false
    toast.add({ color: 'success', title: t('creatorActivation.success') })
  } catch (error) {
    toast.add({ color: 'error', title: t(accountErrorKey(error)) })
  }
}
</script>
<template>
  <div
    v-if="content.enabled"
    class="flex items-center justify-between gap-2 rounded-md border border-default p-2 text-sm">
    <span>{{ t('creatorActivation.title') }}：{{ t(`creatorActivation.state.${status}`) }}</span>
    <UButton
      v-if="status !== 'ACTIVE' && status !== 'BLOCKED'"
      size="sm"
      color="neutral"
      variant="outline"
      @click="open = true">
      {{ t('creatorActivation.activate') }}
    </UButton>
    <UModal
      v-model:open="open"
      :title="t('creatorActivation.activate')"
      :dismissible="!creator.loading">
      <template #body>
        <UFormField :label="t('creatorActivation.code')" :error="codeError || undefined">
          <UInput
            v-model="code"
            class="w-full"
            autocomplete="off"
            :disabled="creator.loading"
            @keydown.enter.prevent="redeem" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="creator.loading" @click="close">
            {{ t('campaign.cancel') }}
          </UButton>
          <UButton :loading="creator.loading" @click="redeem">
            {{ t('creatorActivation.activate') }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
