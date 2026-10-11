<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useApiRequest } from '@/composables/useApiRequest'
import type { SaveOutcome } from '@/composables/useCorrespondentAdmin'
import type { CorrespondentRecord } from '@/db/correspondents'
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

/** Renames `correspondent` when given, creates a new one otherwise. */
const props = defineProps<{ correspondent?: CorrespondentRecord | null }>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{
  saved: [correspondent: CorrespondentRecord, outcome: SaveOutcome]
}>()

const isEdit = computed(() => !!props.correspondent)

const name = ref('')
const { pending, error, run } = useApiRequest()

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    name.value = props.correspondent?.name ?? ''
    error.value = ''
  },
  { immediate: true },
)

async function submit() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    error.value = 'Name darf nicht leer sein'
    return
  }
  const target = props.correspondent
  const data = await run<{
    correspondent: CorrespondentRecord
    created?: boolean
  }>(
    target ? `/api/correspondents/${target.id}` : '/api/correspondents',
    'Ein Fehler ist aufgetreten',
    { method: target ? 'PATCH' : 'POST', body: { name: trimmed } },
  )
  if (!data) return
  const outcome = target ? 'renamed' : data.created ? 'created' : 'existing'
  emit('saved', data.correspondent, outcome)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {{ isEdit ? 'Korrespondent umbenennen' : 'Neuer Korrespondent' }}
        </DialogTitle>
        <DialogDescription>
          {{
            isEdit
              ? 'Der neue Name gilt für alle zugeordneten Dokumente.'
              : 'Geben Sie den Namen des Korrespondenten ein.'
          }}
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="correspondent-name">Name</Label>
          <Input
            id="correspondent-name"
            v-model="name"
            placeholder="z. B. Deutsche Telekom AG"
            maxlength="120"
            :aria-invalid="!!error"
            data-1p-ignore
          />
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        </div>

        <DialogFooter>
          <Button type="submit" :disabled="pending">
            {{ isEdit ? 'Speichern' : 'Erstellen' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
