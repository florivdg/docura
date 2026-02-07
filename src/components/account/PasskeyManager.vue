<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Fingerprint, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

interface Passkey {
  id: string
  name?: string
  deviceType: string
  createdAt: Date
}

const passkeys = ref<Passkey[]>([])
const loading = ref(true)
const error = ref('')

// Add passkey state
const addingPasskey = ref(false)
const newPasskeyName = ref('')

// Rename dialog state
const renameDialogOpen = ref(false)
const renamePasskeyId = ref('')
const renamePasskeyName = ref('')
const renaming = ref(false)

// Delete dialog state
const deleteDialogOpen = ref(false)
const deletePasskeyId = ref('')
const deletePasskeyName = ref('')
const deleting = ref(false)

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function deviceTypeLabel(type: string) {
  return type === 'multiDevice' ? 'Mehrere Geräte' : 'Einzelgerät'
}

function deviceTypeBadgeVariant(type: string) {
  return type === 'multiDevice' ? ('default' as const) : ('secondary' as const)
}

async function fetchPasskeys() {
  error.value = ''
  try {
    const { data, error: fetchError } =
      await authClient.passkey.listUserPasskeys()
    if (fetchError) {
      error.value =
        fetchError.message ?? 'Passkeys konnten nicht geladen werden.'
      return
    }
    passkeys.value = data ?? []
  } catch {
    error.value = 'Passkeys konnten nicht geladen werden.'
  } finally {
    loading.value = false
  }
}

async function handleAddPasskey() {
  if (addingPasskey.value) return
  error.value = ''
  addingPasskey.value = true
  try {
    const { error: addError } = await authClient.passkey.addPasskey({
      name: newPasskeyName.value || undefined,
    })
    if (addError) {
      error.value =
        addError.message ?? 'Passkey konnte nicht hinzugefügt werden.'
      return
    }
    newPasskeyName.value = ''
    await fetchPasskeys()
  } catch {
    error.value = 'Passkey konnte nicht hinzugefügt werden.'
  } finally {
    addingPasskey.value = false
  }
}

function openRenameDialog(passkey: Passkey) {
  renamePasskeyId.value = passkey.id
  renamePasskeyName.value = passkey.name ?? ''
  renameDialogOpen.value = true
}

async function handleRename() {
  if (renaming.value) return
  error.value = ''
  renaming.value = true
  try {
    const { error: renameError } = await authClient.passkey.updatePasskey({
      id: renamePasskeyId.value,
      name: renamePasskeyName.value,
    })
    if (renameError) {
      error.value =
        renameError.message ?? 'Passkey konnte nicht umbenannt werden.'
      return
    }
    renameDialogOpen.value = false
    await fetchPasskeys()
  } catch {
    error.value = 'Passkey konnte nicht umbenannt werden.'
  } finally {
    renaming.value = false
  }
}

function openDeleteDialog(passkey: Passkey) {
  deletePasskeyId.value = passkey.id
  deletePasskeyName.value = passkey.name ?? 'Unbenannter Passkey'
  deleteDialogOpen.value = true
}

async function handleDelete() {
  if (deleting.value) return
  error.value = ''
  deleting.value = true
  try {
    const { error: deleteError } = await authClient.passkey.deletePasskey({
      id: deletePasskeyId.value,
    })
    if (deleteError) {
      error.value =
        deleteError.message ?? 'Passkey konnte nicht gelöscht werden.'
      return
    }
    deleteDialogOpen.value = false
    await fetchPasskeys()
  } catch {
    error.value = 'Passkey konnte nicht gelöscht werden.'
  } finally {
    deleting.value = false
  }
}

onMounted(fetchPasskeys)
</script>

<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div class="space-y-1">
          <CardTitle class="flex items-center gap-2">
            <Fingerprint class="size-5" />
            Passkeys
          </CardTitle>
          <CardDescription>
            Verwalten Sie Ihre Passkeys für die passwortlose Anmeldung
          </CardDescription>
        </div>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <p v-if="error" class="text-destructive text-sm">
        {{ error }}
      </p>

      <!-- Add passkey form -->
      <div class="flex items-end gap-2">
        <Input
          v-model="newPasskeyName"
          placeholder="Name des Passkeys (optional)"
          class="max-w-xs"
          @keydown.enter="handleAddPasskey"
        />
        <Button :disabled="addingPasskey" @click="handleAddPasskey">
          <Plus class="size-4" />
          Passkey hinzufügen
        </Button>
      </div>

      <!-- Loading state -->
      <div v-if="loading" class="space-y-2">
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
        <Skeleton class="h-10 w-full" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="passkeys.length === 0"
        class="flex h-32 items-center justify-center rounded-lg border border-dashed"
      >
        <p class="text-muted-foreground text-sm">
          Keine Passkeys vorhanden. Fügen Sie einen Passkey hinzu, um sich
          passwortlos anzumelden.
        </p>
      </div>

      <!-- Passkeys table -->
      <Table v-else>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Gerätetyp</TableHead>
            <TableHead>Erstellt am</TableHead>
            <TableHead class="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="passkey in passkeys" :key="passkey.id">
            <TableCell class="font-medium">
              {{ passkey.name || 'Unbenannter Passkey' }}
            </TableCell>
            <TableCell>
              <Badge :variant="deviceTypeBadgeVariant(passkey.deviceType)">
                {{ deviceTypeLabel(passkey.deviceType) }}
              </Badge>
            </TableCell>
            <TableCell>{{ formatDate(passkey.createdAt) }}</TableCell>
            <TableCell class="text-right">
              <div class="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  @click="openRenameDialog(passkey)"
                >
                  <Pencil class="size-4" />
                  <span class="sr-only">Umbenennen</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  @click="openDeleteDialog(passkey)"
                >
                  <Trash2 class="text-destructive size-4" />
                  <span class="sr-only">Löschen</span>
                </Button>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <!-- Rename Dialog -->
      <Dialog v-model:open="renameDialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passkey umbenennen</DialogTitle>
            <DialogDescription>
              Geben Sie einen neuen Namen für den Passkey ein.
            </DialogDescription>
          </DialogHeader>
          <Input
            v-model="renamePasskeyName"
            placeholder="Neuer Name"
            @keydown.enter="handleRename"
          />
          <DialogFooter>
            <Button variant="outline" @click="renameDialogOpen = false">
              Abbrechen
            </Button>
            <Button :disabled="renaming" @click="handleRename">
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Delete AlertDialog -->
      <AlertDialog v-model:open="deleteDialogOpen">
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Passkey löschen</AlertDialogTitle>
            <AlertDialogDescription>
              Möchten Sie den Passkey „{{ deletePasskeyName }}“ wirklich
              löschen? Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction :disabled="deleting" @click="handleDelete">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </CardContent>
  </Card>
</template>
