<script setup lang="ts">
import { ref } from 'vue'
import { RefreshCw, RotateCcw, Star, StarOff, Trash2, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import type { BulkPayload } from '@/composables/useBulkDocumentActions'
import { documentCountLabel } from '@/lib/format'
import BulkFolderPicker from './BulkFolderPicker.vue'
import BulkTagPicker from './BulkTagPicker.vue'
import ReprocessDialog from './ReprocessDialog.vue'

/** Actions for the selected documents; the trash view only offers restoring. */
const { count, trashView, pending } = defineProps<{
  count: number
  trashView: boolean
  pending: boolean
}>()
const emit = defineEmits<{ action: [payload: BulkPayload]; clear: [] }>()
const trashOpen = ref(false)
const reprocessOpen = ref(false)
</script>

<template>
  <div
    class="bg-muted/40 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
  >
    <span class="text-sm font-medium"> {{ count }} ausgewählt </span>

    <Button
      v-if="trashView"
      variant="outline"
      size="sm"
      :disabled="pending"
      @click="emit('action', { action: 'restore' })"
    >
      <RotateCcw class="size-4" />
      Wiederherstellen
    </Button>

    <template v-else>
      <BulkFolderPicker
        :disabled="pending"
        @select="(folderId) => emit('action', { action: 'move', folderId })"
      />
      <BulkTagPicker
        :disabled="pending"
        @apply="(tagIds) => emit('action', { action: 'addTags', tagIds })"
      />
      <Button
        variant="outline"
        size="sm"
        :disabled="pending"
        @click="emit('action', { action: 'favorite' })"
      >
        <Star class="size-4" />
        Favorisieren
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="pending"
        @click="emit('action', { action: 'unfavorite' })"
      >
        <StarOff class="size-4" />
        Favorit entfernen
      </Button>
      <Button
        variant="outline"
        size="sm"
        :disabled="pending"
        @click="reprocessOpen = true"
      >
        <RefreshCw class="size-4" />
        Neu verarbeiten
      </Button>
      <Button
        variant="destructive"
        size="sm"
        :disabled="pending"
        @click="trashOpen = true"
      >
        <Trash2 class="size-4" />
        In den Papierkorb
      </Button>
      <ReprocessDialog
        v-model:open="reprocessOpen"
        :count="count"
        :pending="pending"
        @confirm="emit('action', { action: 'reprocess' })"
      />
      <ConfirmDialog
        v-model:open="trashOpen"
        :title="`${documentCountLabel(count)} in den Papierkorb verschieben?`"
        description="Die Dokumente werden in den Papierkorb verschoben und können dort wiederhergestellt werden."
        confirm-label="In den Papierkorb"
        destructive
        @confirm="emit('action', { action: 'trash' })"
      />
    </template>

    <Button
      variant="ghost"
      size="icon"
      class="ml-auto size-8"
      aria-label="Auswahl aufheben"
      title="Auswahl aufheben"
      @click="emit('clear')"
    >
      <X class="size-4" />
    </Button>
  </div>
</template>
