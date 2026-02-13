<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ChevronRight,
  EllipsisVertical,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-vue-next'
import { apiFetch } from '@/lib/api-fetch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import FolderDialog from '@/components/folders/FolderDialog.vue'

interface FolderRow {
  id: string
  name: string
  parentId: string | null
  createdAt: string
  childCount: number
}

interface Breadcrumb {
  id: string
  name: string
}

const folders = ref<FolderRow[]>([])
const breadcrumbs = ref<Breadcrumb[]>([])
const loading = ref(true)
const createOpen = ref(false)
const editOpen = ref(false)
const deleteOpen = ref(false)
const editFolder = ref<{ id: string; name: string } | null>(null)
const deleteFolder = ref<{ id: string; name: string } | null>(null)

const parentId = computed(() => {
  const params = new URLSearchParams(window.location.search)
  return params.get('parent')
})

async function fetchFolders() {
  loading.value = true
  try {
    const query = parentId.value ? `?parentId=${parentId.value}` : ''
    const res = await apiFetch(`/api/folders${query}`)
    const data = await res.json()
    folders.value = data.folders

    if (parentId.value) {
      const bcRes = await apiFetch(`/api/folders/${parentId.value}`)
      const bcData = await bcRes.json()
      breadcrumbs.value = bcData.breadcrumbs
    } else {
      breadcrumbs.value = []
    }
  } finally {
    loading.value = false
  }
}

function navigateToFolder(folderId: string) {
  window.location.href = `/folders?parent=${folderId}`
}

function navigateToRoot() {
  window.location.href = '/folders'
}

function navigateToBreadcrumb(crumb: Breadcrumb) {
  window.location.href = `/folders?parent=${crumb.id}`
}

function openEdit(f: FolderRow) {
  editFolder.value = { id: f.id, name: f.name }
  editOpen.value = true
}

function openDelete(f: FolderRow) {
  deleteFolder.value = { id: f.id, name: f.name }
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deleteFolder.value) return
  try {
    const res = await apiFetch(`/api/folders/${deleteFolder.value.id}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      console.error('Ordner löschen fehlgeschlagen:', res.status)
      window.alert('Fehler beim Löschen des Ordners.')
      return
    }
    deleteOpen.value = false
    deleteFolder.value = null
    await fetchFolders()
  } catch (err) {
    console.error('Ordner löschen fehlgeschlagen:', err)
    window.alert('Fehler beim Löschen des Ordners.')
  }
}

function onSaved() {
  createOpen.value = false
  editOpen.value = false
  editFolder.value = null
  fetchFolders()
}

onMounted(fetchFolders)
</script>

<template>
  <!-- Breadcrumbs -->
  <nav class="flex items-center gap-1 text-sm">
    <button
      class="text-muted-foreground hover:text-foreground transition-colors"
      :class="{ 'text-foreground font-medium': breadcrumbs.length === 0 }"
      @click="navigateToRoot"
    >
      Alle Ordner
    </button>
    <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
      <ChevronRight class="text-muted-foreground size-4 shrink-0" />
      <button
        class="text-muted-foreground hover:text-foreground truncate transition-colors"
        :class="{
          'text-foreground font-medium': index === breadcrumbs.length - 1,
        }"
        @click="navigateToBreadcrumb(crumb)"
      >
        {{ crumb.name }}
      </button>
    </template>
  </nav>

  <!-- Toolbar -->
  <div class="flex items-center justify-between">
    <div />
    <Button size="sm" @click="createOpen = true">
      <FolderPlus class="size-4" />
      Neuer Ordner
    </Button>
  </div>

  <!-- Loading -->
  <div
    v-if="loading"
    class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
  >
    <div
      v-for="i in 8"
      :key="i"
      class="bg-card flex flex-col items-center gap-3 rounded-lg border p-6"
    >
      <Skeleton class="size-10 rounded" />
      <Skeleton class="h-4 w-20" />
    </div>
  </div>

  <!-- Empty state -->
  <div
    v-else-if="folders.length === 0"
    class="flex flex-col items-center gap-2 py-12"
  >
    <FolderOpen class="text-muted-foreground size-8" />
    <p class="text-muted-foreground text-sm">Keine Ordner vorhanden</p>
  </div>

  <!-- Folder grid -->
  <div
    v-else
    class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
  >
    <div
      v-for="f in folders"
      :key="f.id"
      class="bg-card group hover:bg-accent relative flex cursor-pointer flex-col items-center gap-3 rounded-lg border p-6 transition-colors"
      @click="navigateToFolder(f.id)"
    >
      <FolderOpen class="text-muted-foreground size-10" />
      <span class="w-full truncate text-center text-sm font-medium">
        {{ f.name }}
      </span>

      <!-- Context menu -->
      <div
        class="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
        @click.stop
      >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon" class="size-7">
              <EllipsisVertical class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="openEdit(f)">
              <Pencil class="size-4" />
              Umbenennen
            </DropdownMenuItem>
            <DropdownMenuItem class="text-destructive" @click="openDelete(f)">
              <Trash2 class="size-4" />
              Löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>

  <!-- Create dialog -->
  <FolderDialog
    v-model:open="createOpen"
    mode="create"
    :parent-id="parentId"
    @saved="onSaved"
  />

  <!-- Edit dialog -->
  <FolderDialog
    v-if="editFolder"
    v-model:open="editOpen"
    mode="edit"
    :folder="editFolder"
    @saved="onSaved"
  />

  <!-- Delete confirmation -->
  <AlertDialog v-model:open="deleteOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Ordner löschen</AlertDialogTitle>
        <AlertDialogDescription>
          Möchten Sie den Ordner "{{ deleteFolder?.name }}" wirklich löschen?
          Alle Unterordner werden ebenfalls gelöscht.
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
