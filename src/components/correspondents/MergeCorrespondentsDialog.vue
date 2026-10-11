<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CorrespondentRow } from '@/composables/useCorrespondentAdmin'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

const props = defineProps<{ correspondents: CorrespondentRow[] }>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [targetId: string] }>()

const targetId = ref('')

/** Suggests keeping the correspondent with the most documents. */
function suggestedTarget(): string {
  const [first] = [...props.correspondents].sort(
    (a, b) => b.documentCount - a.documentCount,
  )
  return first?.id ?? ''
}

watch(
  open,
  (isOpen) => {
    if (isOpen) targetId.value = suggestedTarget()
  },
  { immediate: true },
)

function confirm() {
  if (!targetId.value) return
  open.value = false
  emit('confirm', targetId.value)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Korrespondenten zusammenführen</DialogTitle>
        <DialogDescription>
          Wählen Sie, welcher Korrespondent erhalten bleibt. Alle Dokumente der
          übrigen – auch archivierte und solche im Papierkorb – werden ihm
          zugeordnet; die übrigen Korrespondenten werden danach gelöscht.
        </DialogDescription>
      </DialogHeader>

      <RadioGroup v-model="targetId" class="gap-3">
        <div
          v-for="c in correspondents"
          :key="c.id"
          class="flex items-center gap-3"
        >
          <RadioGroupItem :id="`merge-target-${c.id}`" :value="c.id" />
          <Label :for="`merge-target-${c.id}`" class="font-normal">
            {{ c.name }}
            <span class="text-muted-foreground">
              ({{ c.documentCount }} aktiv)
            </span>
          </Label>
        </div>
      </RadioGroup>

      <DialogFooter>
        <Button variant="outline" @click="open = false">Abbrechen</Button>
        <Button :disabled="!targetId" @click="confirm">Zusammenführen</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
