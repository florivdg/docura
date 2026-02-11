<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileUp, X, CheckCircle, Loader2, AlertCircle } from 'lucide-vue-next'
import { formatFileSize } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type UploadStatus = 'idle' | 'uploading' | 'completed' | 'error'

interface UploadItem {
  id: string
  file: File
  status: UploadStatus
  progress: number
  error?: string
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
]

const props = withDefaults(
  defineProps<{
    maxFileSizeMb?: number
  }>(),
  { maxFileSizeMb: 50 },
)

const maxFileSize = computed(() => props.maxFileSizeMb * 1024 * 1024)

const open = defineModel<boolean>('open', { default: false })
const isDragOver = ref(false)
const uploads = ref<UploadItem[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Dateityp "${file.type || 'unbekannt'}" wird nicht unterstützt.`
  }
  if (file.size > maxFileSize.value) {
    return `Datei ist zu groß (${formatFileSize(file.size)}). Maximal ${props.maxFileSizeMb} MB erlaubt.`
  }
  return null
}

function addFiles(files: FileList | File[]) {
  for (const file of files) {
    const error = validateFile(file)
    const item: UploadItem = {
      id: crypto.randomUUID(),
      file,
      status: error ? 'error' : 'idle',
      progress: 0,
      error: error ?? undefined,
    }
    uploads.value.push(item)
    if (!error) {
      void uploadFile(item.id)
    }
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  if (event.dataTransfer?.files) {
    addFiles(event.dataTransfer.files)
  }
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    addFiles(input.files)
    input.value = ''
  }
}

function triggerFileInput() {
  fileInput.value?.click()
}

function removeUpload(index: number) {
  uploads.value.splice(index, 1)
}

function getUpload(uploadId: string): UploadItem | undefined {
  return uploads.value.find((upload) => upload.id === uploadId)
}

async function uploadFile(uploadId: string) {
  const item = getUpload(uploadId)
  if (!item) return

  item.status = 'uploading'
  item.progress = 0

  const formData = new FormData()
  formData.append('file', item.file)
  const controller = new AbortController()
  const timeoutMs = Math.max(30_000, Math.ceil(item.file.size / 512) * 1000)
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch('/api/documents/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    const current = getUpload(uploadId)
    if (!current) return

    if (!response.ok) {
      try {
        const body = await response.json()
        current.error =
          body.error || `Upload fehlgeschlagen (${response.status})`
      } catch {
        current.error = `Upload fehlgeschlagen (${response.status})`
      }
      current.status = 'error'
      return
    }

    current.progress = 100
    current.status = 'completed'
  } catch (error) {
    const current = getUpload(uploadId)
    if (!current) return

    if (error instanceof DOMException && error.name === 'AbortError') {
      current.error = 'Upload-Timeout. Bitte erneut versuchen.'
    } else {
      current.error = 'Netzwerkfehler beim Hochladen.'
    }
    current.status = 'error'
  } finally {
    clearTimeout(timeoutId)
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Dokumente hochladen</DialogTitle>
        <DialogDescription>
          PDF, PNG, JPG, WebP oder TIFF Dateien (max. {{ maxFileSizeMb }} MB)
        </DialogDescription>
      </DialogHeader>

      <!-- Drop zone -->
      <div
        class="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors"
        :class="
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        "
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
        @click="triggerFileInput"
      >
        <FileUp class="text-muted-foreground size-8" />
        <p class="text-muted-foreground text-sm">
          Dateien hierher ziehen oder durchsuchen
        </p>
      </div>

      <input
        ref="fileInput"
        type="file"
        class="hidden"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/tiff"
        multiple
        @change="onFileSelect"
      />

      <!-- Upload list -->
      <div v-if="uploads.length > 0" class="max-h-60 space-y-2 overflow-y-auto">
        <div
          v-for="(item, index) in uploads"
          :key="item.id"
          class="flex items-center gap-3 rounded-md border p-3"
        >
          <!-- Status icon -->
          <div class="shrink-0">
            <Loader2
              v-if="item.status === 'uploading'"
              class="text-muted-foreground size-4 animate-spin"
            />
            <CheckCircle
              v-else-if="item.status === 'completed'"
              class="size-4 text-green-600"
            />
            <AlertCircle
              v-else-if="item.status === 'error'"
              class="text-destructive size-4"
            />
            <FileUp v-else class="text-muted-foreground size-4" />
          </div>

          <!-- File info -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ item.file.name }}</p>
            <p class="text-muted-foreground text-xs">
              <template v-if="item.status === 'error'">
                <span class="text-destructive">{{ item.error }}</span>
              </template>
              <template v-else-if="item.status === 'uploading'">
                Wird hochgeladen...
              </template>
              <template v-else-if="item.status === 'completed'">
                Datei hochgeladen
              </template>
              <template v-else>
                {{ formatFileSize(item.file.size) }}
              </template>
            </p>
          </div>

          <!-- Remove button -->
          <Button
            variant="ghost"
            size="icon"
            class="size-7 shrink-0"
            @click="removeUpload(index)"
          >
            <X class="size-3.5" />
            <span class="sr-only">Entfernen</span>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
