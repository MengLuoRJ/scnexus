<script lang="ts" setup>
import { computed, defineComponent, h, shallowRef, watch, onScopeDispose, type VNode } from 'vue'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '../../stores/auth'
import { apiFileRead, apiWorkshopFileRead } from '../../apis/files'
import { ipcShellOpenExternalWebsite } from '../../ipcs/shell'
import { documentFileIds, validateDocument, type RichNode, type WorkshopDocument } from './document'
defineOptions({ name: 'WorkshopRichText' })
const props = defineProps<{ document: WorkshopDocument; projectScnid?: number }>()
const auth = useAuthStore()
const toast = useToast()
const { t } = useI18n()
const reads = shallowRef<Record<string, string>>({})
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
let disposed = false
onScopeDispose(() => {
  disposed = true
  generation++
  clearTimeout(timer)
})
const safe = computed(() => {
  try {
    return validateDocument(props.document)
  } catch {
    return { type: 'doc' as const, content: [] }
  }
})
async function loadImages() {
  if (disposed) return
  clearTimeout(timer)
  const current = ++generation
  reads.value = {}
  const ids = documentFileIds(safe.value)
  if (!ids.length) return
  try {
    const result = props.projectScnid
      ? await apiWorkshopFileRead(props.projectScnid, ids)
      : await apiFileRead(auth.httpAuth, ids)
    if (current === generation) {
      reads.value = Object.fromEntries(result.map((item) => [item.fileId, item.url]))
      const remaining = Math.min(...result.map((item) => Date.parse(item.expiresAt))) - Date.now()
      if (remaining > 30000)
        timer = setTimeout(
          () => {
            void loadImages()
          },
          Math.min(remaining - 30000, 2147483647),
        )
    }
  } catch {
    if (current === generation) toast.add({ color: 'warning', title: t('workshop.imageError') })
  }
}
watch([safe, () => props.projectScnid, () => auth.snapshot.epoch], loadImages, { immediate: true })
async function open(href: string) {
  const result = await ipcShellOpenExternalWebsite(href)
  if (!result.ok) toast.add({ color: 'error', title: t('workshop.linkError') })
}
const Renderer = defineComponent({
  setup: () => () => {
    function render(node: RichNode): VNode {
      if (node.type === 'image') {
        const src = reads.value[String(node.attrs?.fileId)]
        return src
          ? h('img', {
              src,
              alt: node.attrs?.alt ?? '',
              referrerpolicy: 'no-referrer',
              loading: 'lazy',
              class: 'max-w-full rounded max-h-80 object-contain',
            })
          : h('span', { class: 'text-muted text-sm' }, t('workshop.imageUnavailable'))
      }
      if (node.type === 'text') {
        let result = h('span', node.text)
        for (const mark of node.marks ?? []) {
          if (mark.type === 'link')
            result = h(
              'button',
              {
                type: 'button',
                class: 'text-primary underline cursor-pointer',
                onClick: () => open(String(mark.attrs?.href)),
              },
              [result],
            )
          else
            result = h(
              (
                {
                  bold: 'strong',
                  italic: 'em',
                  strike: 's',
                  code: 'code',
                  underline: 'u',
                } as Record<string, string>
              )[mark.type] ?? 'span',
              [result],
            )
        }
        return result
      }
      const tags: Record<string, string> = {
        doc: 'div',
        paragraph: 'p',
        blockquote: 'blockquote',
        bulletList: 'ul',
        orderedList: 'ol',
        listItem: 'li',
        codeBlock: 'pre',
        hardBreak: 'br',
        horizontalRule: 'hr',
      }
      return h(
        node.type === 'heading' ? `h${node.attrs?.level ?? 2}` : (tags[node.type] ?? 'div'),
        node.type === 'orderedList' ? { start: node.attrs?.start } : {},
        node.content?.map(render),
      )
    }
    return render(safe.value)
  },
})
</script>
<template><Renderer class="workshop-document min-w-0 break-words space-y-2" /></template>
<style scoped>
.workshop-document :deep(ul) {
  list-style: disc;
  padding-left: 1.5rem;
}
.workshop-document :deep(ol) {
  list-style: decimal;
  padding-left: 1.5rem;
}
.workshop-document :deep(pre) {
  white-space: pre-wrap;
  background: var(--ui-bg-elevated);
  padding: 0.75rem;
}
.workshop-document :deep(blockquote) {
  border-left: 3px solid var(--ui-border);
  padding-left: 0.75rem;
}
.workshop-document :deep(h1),
.workshop-document :deep(h2),
.workshop-document :deep(h3) {
  font-weight: 600;
  font-size: 1.15rem;
}
</style>
