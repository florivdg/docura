<script setup lang="ts">
import { ref } from 'vue'
import { isImageMime } from '@/lib/format'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { DocumentData } from '@/lib/document-detail'
const { doc } = defineProps<{ doc: DocumentData }>()
const fullscreenZoomed = ref(false)
function isPdf(mime: string) {
  return mime === 'application/pdf'
}
</script>
<template>
  <Dialog>
    <DialogTrigger as-child>
      <Button
        variant="secondary"
        size="icon"
        class="absolute top-2 right-2 size-8"
      >
        <Maximize2 class="size-4" />
      </Button>
    </DialogTrigger>
    <DialogContent
      class="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-[calc(100vw-2rem)]"
    >
      <DialogHeader
        class="flex-row items-center justify-between p-4 pr-14 pb-0"
      >
        <div>
          <DialogTitle class="truncate pr-8">{{ doc.name }}</DialogTitle>
          <DialogDescription class="sr-only"
            >Dokumentenvorschau</DialogDescription
          >
        </div>
        <Button
          v-if="isImageMime(doc.mimeType)"
          variant="ghost"
          size="icon"
          class="size-8 shrink-0"
          @click="fullscreenZoomed = !fullscreenZoomed"
        >
          <ZoomOut v-if="fullscreenZoomed" class="size-4" />
          <ZoomIn v-else class="size-4" />
        </Button>
      </DialogHeader>
      <div
        :class="[
          'min-h-0 flex-1 p-4',
          fullscreenZoomed && isImageMime(doc.mimeType)
            ? 'overflow-auto'
            : 'flex items-center justify-center',
        ]"
      >
        <img
          v-if="isImageMime(doc.mimeType)"
          :src="`/api/documents/${doc.id}/file`"
          :alt="doc.name"
          :class="
            fullscreenZoomed ? 'w-full' : 'max-h-full max-w-full object-contain'
          "
        />
        <iframe
          v-else
          :src="`/api/documents/${doc.id}/file`"
          :title="doc.name"
          class="h-full w-full"
        />
      </div>
    </DialogContent>
  </Dialog>
</template>
