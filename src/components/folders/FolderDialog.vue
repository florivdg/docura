<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const props = defineProps<{
  mode: 'create' | 'edit'
  folder?: { id: string; name: string }
  parentId?: string | null
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const name = ref('')
const saving = ref(false)
const error = ref('')

watch(
  open,
  (val) => {
    if (val) {
      name.value =
        props.mode === 'edit' && props.folder ? props.folder.name : ''
      error.value = ''
    }
  },
  { immediate: true },
)

async function submit() {
  if (!name.value.trim()) {
    error.value = 'Name darf nicht leer sein'
    return
  }

  saving.value = true
  error.value = ''

  try {
    const url =
      props.mode === 'edit'
        ? `/api/folders/${props.folder!.id}`
        : '/api/folders'
    const method = props.mode === 'edit' ? 'PATCH' : 'POST'
    const body: Record<string, unknown> = { name: name.value.trim() }

    if (props.mode === 'create' && props.parentId) {
      body.parentId = props.parentId
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json()
      error.value = data.error || 'Ein Fehler ist aufgetreten'
      return
    }

    emit('saved')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ mode === 'create' ? 'Neuer Ordner' : 'Ordner umbenennen' }}
        </DialogTitle>
        <DialogDescription>
          {{
            mode === 'create'
              ? 'Geben Sie einen Namen für den neuen Ordner ein.'
              : 'Geben Sie einen neuen Namen für den Ordner ein.'
          }}
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="folder-name">Name</Label>
          <Input
            id="folder-name"
            v-model="name"
            placeholder="Ordnername"
            :aria-invalid="!!error"
            data-1p-ignore
          />
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        </div>

        <DialogFooter>
          <Button type="submit" :disabled="saving">
            {{ mode === 'create' ? 'Erstellen' : 'Speichern' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
