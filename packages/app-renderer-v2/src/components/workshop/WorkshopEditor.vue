<script lang="ts" setup>
import { computed, shallowRef } from 'vue'
import { Node } from '@tiptap/core'
import { useI18n } from 'vue-i18n'
import { editorDocument, type WorkshopDocument, type RichNode } from './document'
defineOptions({ name: 'WorkshopEditor' })
const props = withDefaults(
  defineProps<{ modelValue: WorkshopDocument; disabled?: boolean; fileIds?: string[] }>(),
  { disabled: false, fileIds: () => [] },
)
const emit = defineEmits<{ 'update:modelValue': [value: WorkshopDocument] }>()
const { t } = useI18n()
const invalid = shallowRef(false)
const selectedFile = shallowRef('')
const image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  addAttributes: () => ({ fileId: { default: null }, alt: { default: '' } }),
  // No HTML parsing: pasted external images can never become persisted image URLs.
  parseHTML: () => [],
  renderHTML: ({ node }) => [
    'span',
    { 'data-file-id': node.attrs.fileId, contenteditable: 'false', class: 'text-muted' },
    `[${t('workshop.image')}: ${node.attrs.alt || node.attrs.fileId}]`,
  ],
})
const model = computed({
  get: () => props.modelValue,
  set: (value: RichNode) => {
    try {
      emit('update:modelValue', editorDocument(value))
      invalid.value = false
    } catch {
      invalid.value = true
    }
  },
})
const toolbar = [
  [
    { kind: 'mark' as const, mark: 'bold' as const },
    { kind: 'mark' as const, mark: 'italic' as const },
    { kind: 'mark' as const, mark: 'strike' as const },
    { kind: 'mark' as const, mark: 'code' as const },
  ],
  [
    { kind: 'bulletList' as const },
    { kind: 'orderedList' as const },
    { kind: 'blockquote' as const },
  ],
  [{ kind: 'undo' as const }, { kind: 'redo' as const }],
]
</script>
<template>
  <div class="rounded border border-default overflow-hidden">
    <UEditor
      v-slot="{ editor }"
      v-model="model"
      content-type="json"
      :editable="!props.disabled"
      :image="false"
      :mention="false"
      :extensions="[image]"
      :starter-kit="{ link: { openOnClick: false }, codeBlock: { enableTabIndentation: false } }"
      :ui="{ base: 'min-h-28 max-h-64 overflow-y-auto p-3 text-sm' }">
      <UEditorToolbar :editor="editor" :items="toolbar" class="border-b border-default" />
      <div
        v-if="props.fileIds.length && !props.disabled"
        class="flex gap-2 p-2 border-b border-default">
        <USelect
          v-model="selectedFile"
          :items="props.fileIds"
          :placeholder="t('workshop.image')"
          class="min-w-0 flex-1" />
        <UButton
          size="xs"
          :disabled="!selectedFile"
          @click="
            editor
              .chain()
              .focus()
              .insertContent({ type: 'image', attrs: { fileId: selectedFile, alt: '' } })
              .run()
          ">
          {{ t('workshop.insertImage') }}
        </UButton>
      </div>
    </UEditor>
    <p v-if="invalid" role="alert" class="p-2 text-error text-sm">
      {{ t('workshop.invalidDocument') }}
    </p>
  </div>
</template>
