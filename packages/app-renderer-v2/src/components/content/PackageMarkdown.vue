<script lang="ts" setup>
import {
  defineComponent,
  h,
  nextTick,
  onScopeDispose,
  ref,
  shallowRef,
  useTemplateRef,
  watch,
} from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { MarkdownDocument } from '@comark/vue'
import type { MarkdownDocument as Document } from 'comark'
import {
  ProseBlockquote,
  ProseCode,
  ProseEm,
  ProseH1,
  ProseH2,
  ProseH3,
  ProseH4,
  ProseHr,
  ProseLi,
  ProseOl,
  ProseP,
  ProsePre,
  ProseStrong,
  ProseTable,
  ProseTbody,
  ProseTd,
  ProseTh,
  ProseThead,
  ProseTr,
  ProseUl,
} from '@nuxt/ui/components/prose'
import { ipcContentAsset } from '../../ipcs/content'
import { ipcUnwrap } from '../../ipcs/internal/ipc-common'
import { renderPackageMarkdown } from './packageMarkdown'

defineOptions({ name: 'ContentPackageMarkdown' })
const props = withDefaults(defineProps<{ localId: string; path: string; fragment?: string }>(), {
  fragment: '',
})
const emit = defineEmits<{ navigate: [path: string, fragment: string] }>()
const { t } = useI18n()
const document = shallowRef<Document>()
const loading = ref(false)
const error = ref(false)
const missingImages = ref(false)
const refReader = useTemplateRef<HTMLElement>('refReader')
// Explicit mappings prevent the renderer from resolving any globally registered application component.
const native = (tag: string) =>
  defineComponent({
    inheritAttrs: false,
    setup:
      (_, { attrs, slots }) =>
      () =>
        h(tag, attrs, slots.default?.()),
  })
const components: Record<string, Component> = {
  ProseP,
  ProseH1,
  ProseH2,
  ProseH3,
  ProseH4,
  ProseH5: native('h5'),
  ProseH6: native('h6'),
  ProseStrong,
  ProseEm,
  ProseUl,
  ProseOl,
  ProseLi,
  ProseBlockquote,
  ProsePre,
  ProseCode,
  ProseHr,
  ProseTable,
  ProseThead,
  ProseTbody,
  ProseTr,
  ProseTh,
  ProseTd,
  ProseA: native('a'),
  ProseImg: native('img'),
  ProseBr: native('br'),
  ProseS: native('s'),
  ProseDel: native('del'),
}
let generation = 0
onScopeDispose(() => {
  generation++
})
async function scrollToFragment() {
  await nextTick()
  const target = [...(refReader.value?.querySelectorAll('[id]') ?? [])].find(
    (element) => element.id === props.fragment,
  )
  if (target) target.scrollIntoView?.({ block: 'nearest' })
  else if (refReader.value) refReader.value.scrollTop = 0
}
async function load() {
  const request = ++generation
  const id = props.localId
  const path = props.path
  document.value = undefined
  loading.value = true
  error.value = false
  missingImages.value = false
  try {
    const asset = await ipcUnwrap(ipcContentAsset(id, path))
    if (request !== generation) return
    if (!asset || !['text/markdown', 'text/plain'].includes(asset.mime))
      throw new Error('Document unavailable')
    const result = await renderPackageMarkdown(asset.data, path, (imagePath) => {
      if (request !== generation) return Promise.resolve(null)
      return ipcUnwrap(ipcContentAsset(id, imagePath))
    })
    if (request !== generation) return
    document.value = result.document
    missingImages.value = result.missingImages
  } catch {
    if (request === generation) error.value = true
  } finally {
    if (request === generation) {
      loading.value = false
      void scrollToFragment()
    }
  }
}
function navigate(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target.closest('a') : null
  if (!target) return
  event.preventDefault()
  const path = target.dataset.packagePath
  if (!path) return
  const fragment = target.dataset.packageFragment ?? ''
  if (path === props.path) {
    const heading = [...(refReader.value?.querySelectorAll('[id]') ?? [])].find(
      (element) => element.id === fragment,
    )
    heading?.scrollIntoView?.({ block: 'nearest' })
  }
  emit('navigate', path, fragment)
}
watch(() => [props.localId, props.path], load, { immediate: true })
watch(() => props.fragment, scrollToFragment)
</script>

<template>
  <div class="min-w-0">
    <p v-if="loading" class="text-sm text-muted" role="status">{{ t('contentMedia.loading') }}</p>
    <UAlert v-else-if="error" color="warning" :title="t('contentMedia.error')" />
    <UButton v-if="error" size="xs" variant="outline" color="neutral" @click="load">
      {{ t('contentMedia.retry') }}
    </UButton>
    <p v-if="missingImages" class="text-xs text-muted">{{ t('contentMedia.imageError') }}</p>
    <div
      v-if="document && !loading && !error"
      ref="refReader"
      class="package-markdown min-w-0 text-sm"
      @click="navigate">
      <Suspense @resolve="scrollToFragment">
        <MarkdownDocument :value="document" :components="components" />
      </Suspense>
    </div>
  </div>
</template>

<style scoped>
.package-markdown {
  overflow-wrap: anywhere;
}
.package-markdown :deep(img) {
  max-width: 100%;
  height: auto;
}
.package-markdown :deep(pre),
.package-markdown :deep(table) {
  max-width: 100%;
  overflow-x: auto;
}
.package-markdown :deep(a[data-package-path]) {
  color: var(--ui-primary);
  text-decoration: underline;
}
.package-markdown :deep(a[aria-disabled]) {
  color: var(--ui-text-muted);
  cursor: not-allowed;
}
</style>
