<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  Check,
  Combine,
  Contact,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import {
  documentsHref,
  useCorrespondentAdmin,
  type CorrespondentRow,
  type SaveOutcome,
} from '@/composables/useCorrespondentAdmin'
import type { CorrespondentRecord } from '@/db/correspondents'
import { formatDate } from '@/lib/format'
import {
  selectDocument,
  selectionState,
  selectVisible,
} from '@/lib/document-selection'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import StatusMessage from '@/components/StatusMessage.vue'
import CorrespondentDialog from '@/components/correspondents/CorrespondentDialog.vue'
import MergeCorrespondentsDialog from '@/components/correspondents/MergeCorrespondentsDialog.vue'

const {
  correspondents,
  selectedIds,
  selectedSet,
  selected,
  loading,
  pending,
  notice,
  error,
  fetchCorrespondents,
  saved,
  remove,
  merge,
} = useCorrespondentAdmin()

const dialogOpen = ref(false)
/** Row being renamed; `null` while creating a new correspondent. */
const editing = ref<CorrespondentRow | null>(null)
const deleteOpen = ref(false)
const deleting = ref<CorrespondentRow | null>(null)
const mergeOpen = ref(false)

const headerState = computed(() =>
  selectionState(correspondents.value, selectedIds.value),
)

function toggleAll(checked: boolean | 'indeterminate') {
  selectedIds.value = selectVisible(
    correspondents.value,
    selectedIds.value,
    checked,
  )
}

function toggle(id: string, checked: boolean | 'indeterminate') {
  selectedIds.value = selectDocument(id, selectedIds.value, checked)
}

function openDialog(row: CorrespondentRow | null) {
  editing.value = row
  dialogOpen.value = true
}

function openDelete(row: CorrespondentRow) {
  deleting.value = row
  deleteOpen.value = true
}

function onSaved(row: CorrespondentRecord, outcome: SaveOutcome) {
  dialogOpen.value = false
  saved(row, outcome)
}

const deleteDescription = computed(
  () =>
    `Möchten Sie den Korrespondenten „${deleting.value?.name}“ wirklich löschen? Die zugeordneten Dokumente bleiben erhalten, verlieren aber ihren Korrespondenten.`,
)

async function confirmDelete() {
  if (deleting.value) await remove(deleting.value)
}

onMounted(fetchCorrespondents)
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <StatusMessage :error="error" :notice="notice" />
    <div class="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        :disabled="selected.length < 2 || pending"
        title="Mindestens zwei Korrespondenten auswählen"
        @click="mergeOpen = true"
      >
        <Combine class="size-4" />
        Zusammenführen
        <span v-if="selected.length">({{ selected.length }})</span>
      </Button>
      <Button size="sm" @click="openDialog(null)">
        <Plus class="size-4" />
        Neuer Korrespondent
      </Button>
    </div>
  </div>

  <Table>
    <TableHeader>
      <TableRow>
        <TableHead class="w-10 pr-0">
          <Checkbox
            :model-value="headerState"
            :disabled="correspondents.length === 0"
            aria-label="Alle Korrespondenten auswählen"
            @update:model-value="toggleAll"
          >
            <template #default="{ state }">
              <Minus v-if="state === 'indeterminate'" class="size-3.5" />
              <Check v-else class="size-3.5" />
            </template>
          </Checkbox>
        </TableHead>
        <TableHead>Name</TableHead>
        <TableHead title="Ohne archivierte und gelöschte Dokumente">
          Aktive Dokumente
        </TableHead>
        <TableHead>Erstellt</TableHead>
        <TableHead class="w-20" />
      </TableRow>
    </TableHeader>
    <TableBody>
      <template v-if="loading && correspondents.length === 0">
        <TableRow v-for="i in 5" :key="i">
          <TableCell :colspan="5"><Skeleton class="h-4 w-full" /></TableCell>
        </TableRow>
      </template>
      <TableEmpty v-else-if="correspondents.length === 0" :colspan="5">
        <div class="flex flex-col items-center gap-2">
          <Contact class="text-muted-foreground size-8" />
          <p class="text-muted-foreground text-sm">
            Keine Korrespondenten vorhanden
          </p>
        </div>
      </TableEmpty>
      <TableRow
        v-for="c in correspondents"
        v-else
        :key="c.id"
        :data-correspondent-id="c.id"
        :data-state="selectedSet.has(c.id) ? 'selected' : undefined"
      >
        <TableCell class="pr-0">
          <Checkbox
            :model-value="selectedSet.has(c.id)"
            :aria-label="`${c.name} auswählen`"
            @update:model-value="(value) => toggle(c.id, value)"
          />
        </TableCell>
        <TableCell class="font-medium">
          <a
            :href="documentsHref(c.id)"
            class="hover:underline"
            title="Dokumente dieses Korrespondenten anzeigen"
          >
            {{ c.name }}
          </a>
        </TableCell>
        <TableCell>{{ c.documentCount }}</TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDate(c.createdAt) }}
        </TableCell>
        <TableCell>
          <div class="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="size-7"
              :aria-label="`${c.name} umbenennen`"
              @click="openDialog(c)"
            >
              <Pencil class="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="text-destructive size-7"
              :aria-label="`${c.name} löschen`"
              @click="openDelete(c)"
            >
              <Trash2 class="size-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>

  <CorrespondentDialog
    v-model:open="dialogOpen"
    :correspondent="editing"
    @saved="onSaved"
  />
  <ConfirmDialog
    v-model:open="deleteOpen"
    title="Korrespondent löschen"
    :description="deleteDescription"
    confirm-label="Löschen"
    destructive
    :pending="pending"
    @confirm="confirmDelete"
  />
  <MergeCorrespondentsDialog
    v-model:open="mergeOpen"
    :correspondents="selected"
    @confirm="merge"
  />
</template>
