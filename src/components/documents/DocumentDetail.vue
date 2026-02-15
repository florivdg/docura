<script setup lang="ts">
import type { AcceptableValue } from 'reka-ui'
import { computed, nextTick, onMounted, ref } from 'vue'
import { formatFileSize, isImageMime } from '@/lib/format'
import { apiFetch } from '@/lib/api-fetch'
import { statusConfig, stepLabels } from '@/lib/processing'
import { useProcessingEvents } from '@/composables/useProcessingEvents'
import type { DocumentTag } from '@/composables/useDocumentsFilter'
import {
  Archive,
  ArrowLeft,
  Download,
  Trash2,
  FileText,
  Image,
  Clock,
  Loader2,
  CheckCircle2,
  CircleAlert,
  Plus,
  RotateCcw,
  Star,
  X,
  ScanText,
  ChevronsUpDown,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Pencil,
} from 'lucide-vue-next'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import TagDialog from '@/components/tags/TagDialog.vue'

interface DocumentFolder {
  id: string
  name: string
}

interface ProcessingJobData {
  id: string
  status: string
  step: string | null
  errorMessage: string | null
  attempts: number
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

interface DocumentData {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  updatedAt: string
  textContent: string | null
  folder: DocumentFolder | null
  tags: DocumentTag[]
  processingJobs: ProcessingJobData[]
  isFavorite: boolean
  archivedAt: string | null
  trashedAt: string | null
}

const props = defineProps<{
  documentId: string
}>()

interface FolderOption {
  id: string
  name: string
  parentId: string | null
}

const doc = ref<DocumentData | null>(null)
const loading = ref(true)
const notFound = ref(false)
const error = ref(false)
const deleting = ref(false)
const textContentOpen = ref(false)
const editingName = ref(false)
const editNameValue = ref('')
const editNameInput = ref<InstanceType<typeof Input> | null>(null)

async function startEditName() {
  if (!doc.value) return
  editNameValue.value = doc.value.name
  editingName.value = true
  await nextTick()
  const el = editNameInput.value?.$el as HTMLInputElement | undefined
  el?.focus()
}

async function saveDocName() {
  if (!doc.value) return
  const trimmed = editNameValue.value.trim()
  if (!trimmed || trimmed === doc.value.name) {
    editingName.value = false
    return
  }
  const prev = doc.value.name
  doc.value.name = trimmed
  editingName.value = false
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    } else {
      doc.value.name = prev
    }
  } catch {
    if (doc.value) doc.value.name = prev
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

const allFolders = ref<FolderOption[]>([])
const allTags = ref<DocumentTag[]>([])
const tagDialogOpen = ref(false)
const fullscreenZoomed = ref(false)

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr))
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf'
}

async function handleDelete() {
  deleting.value = true
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      window.location.href = '/documents'
    } else {
      console.error('Dokument löschen fehlgeschlagen:', res.status)
      window.alert('Fehler beim Löschen des Dokuments.')
    }
  } catch (err) {
    console.error('Dokument löschen fehlgeschlagen:', err)
    window.alert('Fehler beim Löschen des Dokuments.')
  } finally {
    deleting.value = false
  }
}

const restoring = ref(false)
const permanentlyDeleting = ref(false)
const archiving = ref(false)

const backUrl = computed(() => {
  if (doc.value?.trashedAt) return '/documents?view=trash'
  if (doc.value?.archivedAt) return '/documents?view=archive'
  return '/documents'
})

async function toggleFavorite() {
  if (!doc.value) return
  const prev = doc.value.isFavorite
  doc.value.isFavorite = !prev
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: !prev }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    } else if (doc.value) {
      doc.value.isFavorite = prev
    }
  } catch {
    if (doc.value) doc.value.isFavorite = prev
  }
}

async function handleRestore() {
  if (!doc.value) return
  restoring.value = true
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashedAt: null }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    }
  } catch {
    // ignore
  } finally {
    restoring.value = false
  }
}

async function handlePermanentDelete() {
  permanentlyDeleting.value = true
  try {
    const res = await apiFetch(
      `/api/documents/${props.documentId}?permanent=true`,
      { method: 'DELETE' },
    )
    if (res.ok) {
      window.location.href = '/documents?view=trash'
    } else {
      window.alert('Fehler beim endgültigen Löschen des Dokuments.')
    }
  } catch {
    window.alert('Fehler beim endgültigen Löschen des Dokuments.')
  } finally {
    permanentlyDeleting.value = false
  }
}

async function handleArchive() {
  if (!doc.value) return
  archiving.value = true
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: new Date().toISOString() }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    }
  } catch {
    // ignore
  } finally {
    archiving.value = false
  }
}

async function handleUnarchive() {
  if (!doc.value) return
  archiving.value = true
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archivedAt: null }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    }
  } catch {
    // ignore
  } finally {
    archiving.value = false
  }
}

const NONE_SENTINEL = '__none__'

function selectedFolderValue(): string {
  return doc.value?.folder?.id ?? NONE_SENTINEL
}

async function handleFolderChange(value: AcceptableValue) {
  if (!doc.value) return

  const prevFolder = doc.value.folder
  const strValue = String(value)
  const newFolderId = strValue === NONE_SENTINEL ? null : strValue
  const newFolder = newFolderId
    ? (allFolders.value.find((f) => f.id === newFolderId) ?? null)
    : null

  doc.value.folder = newFolder
    ? { id: newFolder.id, name: newFolder.name }
    : null

  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: newFolderId }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    } else if (doc.value) {
      doc.value.folder = prevFolder
    }
  } catch {
    if (doc.value) doc.value.folder = prevFolder
  }
}

async function handleTagToggle(tagId: string, checked: boolean) {
  if (!doc.value) return

  const prevTags = [...doc.value.tags]
  let newTagIds: string[]

  if (checked) {
    const tagToAdd = allTags.value.find((t) => t.id === tagId)
    if (tagToAdd) doc.value.tags = [...doc.value.tags, tagToAdd]
    newTagIds = doc.value.tags.map((t) => t.id)
  } else {
    doc.value.tags = doc.value.tags.filter((t) => t.id !== tagId)
    newTagIds = doc.value.tags.map((t) => t.id)
  }

  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: newTagIds }),
    })
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    } else if (doc.value) {
      doc.value.tags = prevTags
    }
  } catch {
    if (doc.value) doc.value.tags = prevTags
  }
}

async function handleTagRemove(tagId: string) {
  await handleTagToggle(tagId, false)
}

function isTagAssigned(tagId: string): boolean {
  return doc.value?.tags.some((t) => t.id === tagId) ?? false
}

async function fetchAllTags() {
  try {
    const res = await apiFetch('/api/tags')
    if (res.ok) {
      const data = await res.json()
      allTags.value = data.tags
    }
  } catch {
    // ignore
  }
}

async function handleTagCreated(tag: {
  id: string
  name: string
  color: string | null
}) {
  tagDialogOpen.value = false
  await fetchAllTags()
  await handleTagToggle(tag.id, true)
}

onMounted(async () => {
  try {
    const [docRes, foldersRes, tagsRes] = await Promise.all([
      apiFetch(`/api/documents/${props.documentId}`),
      apiFetch('/api/folders/all'),
      apiFetch('/api/tags'),
    ])

    if (docRes.status === 404) {
      notFound.value = true
      return
    }
    if (!docRes.ok) {
      error.value = true
      return
    }

    const docData = await docRes.json()
    doc.value = docData.document

    if (foldersRes.ok) {
      const foldersData = await foldersRes.json()
      allFolders.value = foldersData.folders
    }

    if (tagsRes.ok) {
      const tagsData = await tagsRes.json()
      allTags.value = tagsData.tags
    }
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
})

async function refetchDocument() {
  try {
    const res = await apiFetch(`/api/documents/${props.documentId}`)
    if (res.ok) {
      const data = await res.json()
      doc.value = data.document
    }
  } catch {
    // ignore
  }
}

const hasActiveProcessing = computed(
  () =>
    doc.value?.processingJobs.some(
      (j) => j.status === 'pending' || j.status === 'processing',
    ) ?? false,
)

useProcessingEvents(
  (event) => {
    if (!doc.value || event.documentId !== props.documentId) return

    if (event.type === 'step_change') {
      const job = doc.value.processingJobs.find((j) => j.id === event.jobId)
      if (job) {
        job.status = event.status
        job.step = event.step
      }
    } else if (event.type === 'completed') {
      const job = doc.value.processingJobs.find((j) => j.id === event.jobId)
      if (job) {
        job.status = 'completed'
        job.step = null
      }
      void refetchDocument()
    } else if (event.type === 'failed') {
      const job = doc.value.processingJobs.find((j) => j.id === event.jobId)
      if (job) {
        job.status = 'failed'
        job.step = null
        job.errorMessage = event.errorMessage ?? null
      }
    }
  },
  { enabled: hasActiveProcessing },
)
</script>

<template>
  <!-- Loading state -->
  <template v-if="loading">
    <div class="flex items-center justify-between">
      <Skeleton class="h-9 w-48" />
      <div class="flex gap-2">
        <Skeleton class="h-9 w-32" />
        <Skeleton class="h-9 w-24" />
      </div>
    </div>
    <div class="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
      <div class="flex flex-col gap-4 md:gap-6">
        <Skeleton class="h-[500px] rounded-lg" />
      </div>
      <div class="flex flex-col gap-4 md:gap-6">
        <Skeleton class="h-56 rounded-lg" />
        <Skeleton class="h-40 rounded-lg" />
      </div>
    </div>
  </template>

  <!-- Not found state -->
  <template v-else-if="notFound">
    <div class="flex flex-col items-center justify-center gap-4 py-20">
      <FileText class="text-muted-foreground size-12" />
      <p class="text-muted-foreground text-lg">Dokument nicht gefunden</p>
      <Button variant="outline" as-child>
        <a :href="backUrl">
          <ArrowLeft class="size-4" />
          Zurück zu Dokumente
        </a>
      </Button>
    </div>
  </template>

  <!-- Error state -->
  <template v-else-if="error">
    <div class="flex flex-col items-center justify-center gap-4 py-20">
      <CircleAlert class="text-muted-foreground size-12" />
      <p class="text-muted-foreground text-lg">
        Fehler beim Laden des Dokuments
      </p>
      <Button variant="outline" as-child>
        <a :href="backUrl">
          <ArrowLeft class="size-4" />
          Zurück zu Dokumente
        </a>
      </Button>
    </div>
  </template>

  <!-- Data state -->
  <template v-else-if="doc">
    <!-- Header -->
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <Button variant="ghost" size="icon" as-child>
          <a :href="backUrl">
            <ArrowLeft class="size-4" />
          </a>
        </Button>
        <Input
          v-if="editingName"
          ref="editNameInput"
          v-model="editNameValue"
          class="h-8 w-full max-w-lg text-lg font-semibold"
          @keydown.enter="saveDocName"
          @keydown.escape="editingName = false"
          @blur="saveDocName"
        />
        <h1
          v-else
          class="group flex cursor-pointer items-center gap-1.5 truncate text-lg font-semibold"
          title="Klicken zum Bearbeiten"
          @click="startEditName"
        >
          {{ doc.name }}
          <Pencil
            class="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-50"
          />
        </h1>
      </div>
      <div class="flex gap-2">
        <Button variant="ghost" size="icon" @click="toggleFavorite">
          <Star
            class="size-4"
            :class="doc.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''"
          />
        </Button>
        <Button variant="outline" as-child>
          <a :href="`/api/documents/${doc.id}/file?download=true`">
            <Download class="size-4" />
            Herunterladen
          </a>
        </Button>
        <template v-if="!doc.trashedAt">
          <Button
            v-if="!doc.archivedAt"
            variant="outline"
            :disabled="archiving"
            @click="handleArchive"
          >
            <Archive class="size-4" />
            Archivieren
          </Button>
          <AlertDialog>
            <AlertDialogTrigger as-child>
              <Button variant="destructive" :disabled="deleting">
                <Loader2 v-if="deleting" class="size-4 animate-spin" />
                <Trash2 v-else class="size-4" />
                Löschen
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle
                  >In den Papierkorb verschieben?</AlertDialogTitle
                >
                <AlertDialogDescription>
                  Das Dokument „{{ doc.name }}" wird in den Papierkorb
                  verschoben. Sie können es dort wiederherstellen oder endgültig
                  löschen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction
                  class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  @click="handleDelete"
                >
                  In den Papierkorb
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </template>
      </div>
    </div>

    <!-- Trash banner -->
    <div
      v-if="doc.trashedAt"
      class="border-destructive/30 bg-destructive/10 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-sm font-medium">
        Dieses Dokument befindet sich im Papierkorb.
      </p>
      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          :disabled="restoring"
          @click="handleRestore"
        >
          <RotateCcw class="size-4" />
          Wiederherstellen
        </Button>
        <AlertDialog>
          <AlertDialogTrigger as-child>
            <Button
              variant="destructive"
              size="sm"
              :disabled="permanentlyDeleting"
            >
              <Trash2 class="size-4" />
              Endgültig löschen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Endgültig löschen?</AlertDialogTitle>
              <AlertDialogDescription>
                Das Dokument „{{ doc.name }}" wird unwiderruflich gelöscht.
                Diese Aktion kann nicht rückgängig gemacht werden.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                @click="handlePermanentDelete"
              >
                Endgültig löschen
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>

    <!-- Archive banner -->
    <div
      v-else-if="doc.archivedAt"
      class="border-border bg-muted/50 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <p class="text-sm font-medium">Dieses Dokument ist archiviert.</p>
      <Button
        variant="outline"
        size="sm"
        :disabled="archiving"
        @click="handleUnarchive"
      >
        <Archive class="size-4" />
        Aus Archiv entfernen
      </Button>
    </div>

    <!-- Content -->
    <div class="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
      <!-- Left column: Preview + OCR text -->
      <div class="flex flex-col gap-4 md:gap-6">
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
            <p class="text-muted-foreground text-sm">
              Vorschau nicht verfügbar
            </p>
          </div>

          <!-- Fullscreen preview dialog -->
          <Dialog v-if="isImageMime(doc.mimeType) || isPdf(doc.mimeType)">
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
                  <DialogTitle class="truncate pr-8">{{
                    doc.name
                  }}</DialogTitle>
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
                    fullscreenZoomed
                      ? 'w-full'
                      : 'max-h-full max-w-full object-contain'
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
        </div>

        <!-- OCR text panel -->
        <Collapsible v-if="doc.textContent" v-model:open="textContentOpen">
          <Card>
            <CollapsibleTrigger as-child>
              <CardHeader class="cursor-pointer select-none">
                <CardTitle class="flex items-center gap-2">
                  <ScanText class="text-muted-foreground size-4" />
                  Erkannter Text
                </CardTitle>
                <CardAction>
                  <div class="flex items-center gap-2">
                    <span class="text-muted-foreground text-xs font-normal">
                      {{ wordCount(doc.textContent).toLocaleString('de-DE') }}
                      Wörter
                    </span>
                    <ChevronsUpDown class="text-muted-foreground size-4" />
                  </div>
                </CardAction>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <div
                  class="bg-muted/30 max-h-80 overflow-y-auto rounded-md p-4"
                >
                  <p class="text-muted-foreground mb-2 text-xs italic">
                    Automatisch extrahierter Text — kann Fehler enthalten.
                  </p>
                  <Separator class="mb-3" />
                  <pre
                    class="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap"
                    >{{ doc.textContent }}</pre
                  >
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <!-- Sidebar -->
      <div class="flex flex-col gap-4 md:gap-6">
        <!-- Metadata card -->
        <Card>
          <CardHeader>
            <CardTitle>Metadaten</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Typ</span>
              <span>{{ doc.mimeType }}</span>
            </div>
            <Separator />
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Größe</span>
              <span>{{ formatFileSize(doc.fileSize) }}</span>
            </div>
            <Separator />
            <div class="flex items-center justify-between text-sm">
              <span class="text-muted-foreground">Ordner</span>
              <Select
                :model-value="selectedFolderValue()"
                @update:model-value="handleFolderChange"
              >
                <SelectTrigger size="sm" class="h-7 w-auto max-w-[180px]">
                  <SelectValue placeholder="Kein Ordner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="NONE_SENTINEL">Kein Ordner</SelectItem>
                  <SelectItem v-for="f in allFolders" :key="f.id" :value="f.id">
                    {{ f.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Separator />
            <div class="flex flex-col gap-2 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-muted-foreground">Tags</span>
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon" class="size-6">
                      <Plus class="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-48">
                    <DropdownMenuLabel>Tags zuweisen</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      v-for="t in allTags"
                      :key="t.id"
                      :model-value="isTagAssigned(t.id)"
                      @update:model-value="
                        (checked: boolean) => handleTagToggle(t.id, checked)
                      "
                    >
                      <span class="flex items-center gap-2">
                        <span
                          v-if="t.color"
                          class="size-2.5 shrink-0 rounded-full"
                          :style="{ backgroundColor: t.color }"
                        />
                        {{ t.name }}
                      </span>
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem @click="tagDialogOpen = true">
                      <Plus class="size-4" />
                      Neuen Tag erstellen
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div v-if="doc.tags.length > 0" class="flex flex-wrap gap-1">
                <Badge
                  v-for="t in doc.tags"
                  :key="t.id"
                  variant="secondary"
                  class="gap-1 pr-1"
                  :style="
                    t.color
                      ? { backgroundColor: t.color + '20', color: t.color }
                      : {}
                  "
                >
                  {{ t.name }}
                  <button
                    class="hover:bg-muted rounded-sm p-0.5"
                    @click="handleTagRemove(t.id)"
                  >
                    <X class="size-3" />
                  </button>
                </Badge>
              </div>
              <span v-else class="text-muted-foreground">—</span>
            </div>
            <Separator />
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Hochgeladen</span>
              <span>{{ formatDate(doc.createdAt) }}</span>
            </div>
            <Separator />
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Aktualisiert</span>
              <span>{{ formatDate(doc.updatedAt) }}</span>
            </div>
          </CardContent>
        </Card>

        <!-- Processing card -->
        <Card>
          <CardHeader>
            <CardTitle>Verarbeitung</CardTitle>
          </CardHeader>
          <CardContent>
            <template v-if="doc.processingJobs.length === 0">
              <p class="text-muted-foreground text-sm">
                Keine Verarbeitungsvorgänge
              </p>
            </template>
            <div v-else class="space-y-3">
              <div v-for="(job, i) in doc.processingJobs" :key="job.id">
                <Separator v-if="i > 0" class="mb-3" />
                <div class="flex items-start justify-between gap-2">
                  <div class="space-y-1">
                    <div class="flex items-center gap-2">
                      <Badge
                        :variant="
                          statusConfig[job.status]?.variant ?? 'secondary'
                        "
                        :class="statusConfig[job.status]?.class"
                      >
                        <Clock v-if="job.status === 'pending'" class="size-3" />
                        <Loader2
                          v-else-if="job.status === 'processing'"
                          class="size-3 animate-spin"
                        />
                        <CheckCircle2
                          v-else-if="job.status === 'completed'"
                          class="size-3"
                        />
                        <CircleAlert
                          v-else-if="job.status === 'failed'"
                          class="size-3"
                        />
                        {{ statusConfig[job.status]?.label ?? job.status }}
                      </Badge>
                      <span
                        v-if="job.step"
                        class="text-muted-foreground text-xs"
                      >
                        {{ stepLabels[job.step] ?? job.step }}
                      </span>
                    </div>
                    <p v-if="job.errorMessage" class="text-destructive text-xs">
                      {{ job.errorMessage }}
                    </p>
                  </div>
                  <span class="text-muted-foreground shrink-0 text-xs">
                    {{ formatDate(job.createdAt) }}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>

    <TagDialog
      v-model:open="tagDialogOpen"
      mode="create"
      @saved="handleTagCreated"
    />
  </template>
</template>
