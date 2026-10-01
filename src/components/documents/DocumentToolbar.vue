<script setup lang="ts">
import { nextTick, ref } from 'vue'
import {
  Archive,
  ArrowLeft,
  Download,
  Trash2,
  Loader2,
  Star,
  Pencil,
} from 'lucide-vue-next'
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
import { Input } from '@/components/ui/input'
import type { DocumentData } from '@/lib/document-detail'
const doc = defineModel<DocumentData>('doc', { required: true })
const { backUrl, archiving, deleting, patchDocument } = defineProps<{
  backUrl: string
  archiving: boolean
  deleting: boolean
  patchDocument: (
    payload: Record<string, unknown>,
    rollback?: () => void,
  ) => Promise<void>
}>()
const emit = defineEmits<{ favorite: []; archive: []; delete: [] }>()
const editingName = ref(false)
const editNameValue = ref('')
const editNameInput = ref<InstanceType<typeof Input> | null>(null)

async function startEditName() {
  editNameValue.value = doc.value.name
  editingName.value = true
  await nextTick()
  const el = editNameInput.value?.$el as HTMLInputElement | undefined
  el?.focus()
}

async function saveDocName() {
  const trimmed = editNameValue.value.trim()
  if (!trimmed || trimmed === doc.value.name) {
    editingName.value = false
    return
  }
  const prev = doc.value.name
  doc.value.name = trimmed
  editingName.value = false
  await patchDocument({ name: trimmed }, () => {
    if (doc.value) doc.value.name = prev
  })
}
</script>
<template>
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
    <div class="flex flex-wrap gap-2">
      <Button variant="ghost" size="icon" @click="emit('favorite')">
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
          @click="emit('archive')"
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
                Das Dokument „{{ doc.name }}" wird in den Papierkorb verschoben.
                Sie können es dort wiederherstellen oder endgültig löschen.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Abbrechen</AlertDialogCancel>
              <AlertDialogAction
                class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                @click="emit('delete')"
              >
                In den Papierkorb
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </template>
    </div>
  </div>
</template>
