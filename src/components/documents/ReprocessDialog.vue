<script setup lang="ts">
import { computed } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { documentCountLabel } from '@/lib/format'

/** Confirms reprocessing of one document (`name`) or a selection (`count`). */
const props = defineProps<{
  name?: string
  count?: number
  pending?: boolean
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const EFFECTS =
  'Text, Titel, Tags und Einbettung werden neu erzeugt. Manuell gesetzte Ordner, Korrespondenten und Belegdaten bleiben erhalten; der Titel wird durch den KI-Vorschlag ersetzt, Tags werden ergänzt.'

const title = computed(() => {
  if (props.name) return `„${props.name}“ neu verarbeiten?`
  return `${documentCountLabel(props.count ?? 0)} neu verarbeiten?`
})
const description = computed(() =>
  props.name
    ? EFFECTS
    : `${EFFECTS} Dokumente im Papierkorb oder in laufender Verarbeitung werden übersprungen.`,
)
</script>

<template>
  <ConfirmDialog
    v-model:open="open"
    :title="title"
    :description="description"
    confirm-label="Neu verarbeiten"
    :pending="pending"
    @confirm="emit('confirm')"
  />
</template>
