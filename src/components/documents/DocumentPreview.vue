<script setup lang="ts">
import { isImageMime } from '@/lib/format'
import { FileText } from 'lucide-vue-next'
import DocumentFullscreenPreview from './DocumentFullscreenPreview.vue'
import type { DocumentData } from '@/lib/document-detail'
const { doc } = defineProps<{ doc: DocumentData }>()
function isPdf(mime: string) {
  return mime === 'application/pdf'
}
</script>
<template>
  <!-- Preview -->
  <div
    class="bg-muted/50 relative flex items-center justify-center overflow-hidden rounded-lg border"
  >
    <img
      v-if="isImageMime(doc.mimeType)"
      :src="`/api/documents/${doc.id}/file`"
      :alt="doc.name"
      class="max-h-[600px] w-full object-contain p-4"
    />
    <iframe
      v-else-if="isPdf(doc.mimeType)"
      :src="`/api/documents/${doc.id}/file`"
      :title="doc.name"
      class="h-[600px] w-full"
    />
    <div v-else class="flex flex-col items-center gap-3 py-20">
      <FileText class="text-muted-foreground size-16" />
      <p class="text-muted-foreground text-sm">Vorschau nicht verfügbar</p>
    </div>

    <!-- Fullscreen preview dialog -->
    <DocumentFullscreenPreview
      v-if="isImageMime(doc.mimeType) || isPdf(doc.mimeType)"
      :doc="doc"
    />
  </div>
</template>
