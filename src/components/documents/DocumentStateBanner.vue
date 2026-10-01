<script setup lang="ts">
import { Archive, Trash2, RotateCcw } from 'lucide-vue-next'
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
import type { DocumentData } from '@/lib/document-detail'
const { doc, restoring, permanentlyDeleting, archiving } = defineProps<{
  doc: DocumentData
  restoring: boolean
  permanentlyDeleting: boolean
  archiving: boolean
}>()
const emit = defineEmits<{ restore: []; permanentDelete: []; unarchive: [] }>()
</script>
<template>
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
        @click="emit('restore')"
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
              Das Dokument „{{ doc.name }}" wird unwiderruflich gelöscht. Diese
              Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              @click="emit('permanentDelete')"
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
      @click="emit('unarchive')"
    >
      <Archive class="size-4" />
      Aus Archiv entfernen
    </Button>
  </div>
</template>
