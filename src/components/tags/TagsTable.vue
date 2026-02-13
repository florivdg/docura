<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Pencil, Plus, Tag, Trash2 } from 'lucide-vue-next'
import { apiFetch } from '@/lib/api-fetch'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import TagDialog from '@/components/tags/TagDialog.vue'

interface TagRow {
  id: string
  name: string
  color: string | null
  createdAt: string
  documentCount: number
}

const tags = ref<TagRow[]>([])
const loading = ref(true)
const createOpen = ref(false)
const editOpen = ref(false)
const deleteOpen = ref(false)
const editTag = ref<{ id: string; name: string; color: string | null } | null>(
  null,
)
const deleteTag = ref<{ id: string; name: string } | null>(null)

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr))
}

async function fetchTags() {
  loading.value = true
  try {
    const res = await apiFetch('/api/tags')
    const data = await res.json()
    tags.value = data.tags
  } finally {
    loading.value = false
  }
}

function openEdit(t: TagRow) {
  editTag.value = { id: t.id, name: t.name, color: t.color }
  editOpen.value = true
}

function openDelete(t: TagRow) {
  deleteTag.value = { id: t.id, name: t.name }
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deleteTag.value) return
  try {
    const res = await apiFetch(`/api/tags/${deleteTag.value.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      console.error('Tag löschen fehlgeschlagen:', res.status)
      window.alert('Fehler beim Löschen des Tags.')
      return
    }
    deleteOpen.value = false
    deleteTag.value = null
    await fetchTags()
  } catch (err) {
    console.error('Tag löschen fehlgeschlagen:', err)
    window.alert('Fehler beim Löschen des Tags.')
  }
}

function onSaved() {
  createOpen.value = false
  editOpen.value = false
  editTag.value = null
  fetchTags()
}

onMounted(fetchTags)
</script>

<template>
  <!-- Toolbar -->
  <div class="flex items-center justify-between">
    <div />
    <Button size="sm" @click="createOpen = true">
      <Plus class="size-4" />
      Neuer Tag
    </Button>
  </div>

  <!-- Loading -->
  <template v-if="loading">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Farbe</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Dokumente</TableHead>
          <TableHead>Erstellt</TableHead>
          <TableHead class="w-[70px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="i in 5" :key="i">
          <TableCell><Skeleton class="size-4 rounded-full" /></TableCell>
          <TableCell><Skeleton class="h-4 w-24" /></TableCell>
          <TableCell><Skeleton class="h-4 w-8" /></TableCell>
          <TableCell><Skeleton class="h-4 w-20" /></TableCell>
          <TableCell><Skeleton class="h-4 w-8" /></TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </template>

  <!-- Empty state -->
  <template v-else-if="tags.length === 0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Farbe</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Dokumente</TableHead>
          <TableHead>Erstellt</TableHead>
          <TableHead class="w-[70px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableEmpty :colspan="5">
          <div class="flex flex-col items-center gap-2">
            <Tag class="text-muted-foreground size-8" />
            <p class="text-muted-foreground text-sm">Keine Tags vorhanden</p>
          </div>
        </TableEmpty>
      </TableBody>
    </Table>
  </template>

  <!-- Tags table -->
  <template v-else>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Farbe</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Dokumente</TableHead>
          <TableHead>Erstellt</TableHead>
          <TableHead class="w-[70px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="t in tags" :key="t.id">
          <TableCell>
            <div
              v-if="t.color"
              class="size-4 rounded-full"
              :style="{ backgroundColor: t.color }"
            />
            <div
              v-else
              class="border-muted-foreground size-4 rounded-full border border-dashed"
            />
          </TableCell>
          <TableCell class="font-medium">{{ t.name }}</TableCell>
          <TableCell>{{ t.documentCount }}</TableCell>
          <TableCell class="whitespace-nowrap">
            {{ formatDate(t.createdAt) }}
          </TableCell>
          <TableCell>
            <div class="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                class="size-7"
                @click="openEdit(t)"
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive size-7"
                @click="openDelete(t)"
              >
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </template>

  <!-- Create dialog -->
  <TagDialog v-model:open="createOpen" mode="create" @saved="onSaved" />

  <!-- Edit dialog -->
  <TagDialog
    v-if="editTag"
    v-model:open="editOpen"
    mode="edit"
    :tag="editTag"
    @saved="onSaved"
  />

  <!-- Delete confirmation -->
  <AlertDialog v-model:open="deleteOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Tag löschen</AlertDialogTitle>
        <AlertDialogDescription>
          Möchten Sie den Tag "{{ deleteTag?.name }}" wirklich löschen? Der Tag
          wird von allen verknüpften Dokumenten entfernt.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          @click="confirmDelete"
        >
          Löschen
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
