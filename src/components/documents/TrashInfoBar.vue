<script setup lang="ts">
import { ref } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

/** Retention notice and "Papierkorb leeren" above the trash list. */
defineProps<{ retentionDays: number | null; emptying: boolean }>()
const emit = defineEmits<{ empty: [] }>()
const confirmOpen = ref(false)
</script>

<template>
  <div
    class="border-destructive/30 bg-destructive/5 flex items-center justify-between rounded-lg border px-4 py-3"
  >
    <p v-if="retentionDays" class="text-muted-foreground text-sm">
      Dokumente im Papierkorb werden nach {{ retentionDays }} Tagen automatisch
      gelöscht.
    </p>
    <Button
      variant="destructive"
      size="sm"
      :disabled="emptying"
      @click="confirmOpen = true"
    >
      <Trash2 class="size-4" />
      Papierkorb leeren
    </Button>
    <ConfirmDialog
      v-model:open="confirmOpen"
      title="Papierkorb leeren?"
      description="Alle Dokumente im Papierkorb werden endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
      confirm-label="Endgültig löschen"
      destructive
      @confirm="emit('empty')"
    />
  </div>
</template>
