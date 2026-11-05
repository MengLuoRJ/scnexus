<script lang="ts" setup>
import { defineComponent, h, shallowRef, watch } from 'vue'
import type { VNodeChild } from 'vue'
import { createMarkdownParser } from 'comark'
import type { Node } from 'comark'
defineOptions({ name: 'AccountInboxBody' })
const props = defineProps<{ body: string }>()
const nodes = shallowRef<Node[]>([])
const parse = createMarkdownParser({ registerDefaultPlugins: false, linkify: false })
const allowed = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  's',
  'del',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'br',
])
function renderNode(node: Node): VNodeChild {
  if (typeof node === 'string') return node
  const [tag, , ...children] = node
  if (tag === 'img') return ''
  const content = children.map(renderNode)
  return tag && allowed.has(tag) ? h(tag, null, content) : content
}
const BodyContent = defineComponent({ setup: () => () => h('div', nodes.value.map(renderNode)) })
watch(
  () => props.body,
  async (body, _, onCleanup) => {
    let cancelled = false
    onCleanup(() => {
      cancelled = true
    })
    nodes.value = []
    try {
      const parsed = await parse(body)
      if (!cancelled) nodes.value = parsed.nodes
    } catch {
      if (!cancelled) nodes.value = [body]
    }
  },
  { immediate: true },
)
</script>
<template>
  <BodyContent class="inbox-body text-sm break-words" />
</template>
<style scoped>
.inbox-body :deep(p),
.inbox-body :deep(pre),
.inbox-body :deep(blockquote),
.inbox-body :deep(ul),
.inbox-body :deep(ol) {
  margin-block: 0.75em;
}
.inbox-body :deep(h1),
.inbox-body :deep(h2),
.inbox-body :deep(h3),
.inbox-body :deep(h4),
.inbox-body :deep(h5),
.inbox-body :deep(h6) {
  font-weight: 600;
  margin-block: 1em 0.5em;
}
.inbox-body :deep(ul) {
  list-style: disc;
  padding-left: 1.5em;
}
.inbox-body :deep(ol) {
  list-style: decimal;
  padding-left: 1.5em;
}
.inbox-body :deep(pre) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.inbox-body :deep(blockquote) {
  border-left: 2px solid var(--ui-border);
  padding-left: 0.75em;
}
</style>
