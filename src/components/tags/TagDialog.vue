<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check } from 'lucide-vue-next'
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
  tag?: { id: string; name: string; color: string | null }
}>()

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ saved: [] }>()

const name = ref('')
const color = ref<string | null>(null)
const saving = ref(false)
const error = ref('')

const presetColors = [
  { name: 'Rot', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Bernstein', value: '#f59e0b' },
  { name: 'Grün', value: '#22c55e' },
  { name: 'Smaragd', value: '#10b981' },
  { name: 'Blau', value: '#3b82f6' },
  { name: 'Violett', value: '#8b5cf6' },
  { name: 'Lila', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Schiefer', value: '#64748b' },
]

watch(open, (val) => {
  if (val) {
    name.value = props.mode === 'edit' && props.tag ? props.tag.name : ''
    color.value = props.mode === 'edit' && props.tag ? props.tag.color : null
    error.value = ''
  }
})

function selectColor(c: string | null) {
  color.value = c
}

async function submit() {
  if (!name.value.trim()) {
    error.value = 'Name darf nicht leer sein'
    return
  }

  saving.value = true
  error.value = ''

  try {
    const url =
      props.mode === 'edit' ? `/api/tags/${props.tag!.id}` : '/api/tags'
    const method = props.mode === 'edit' ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.value.trim(), color: color.value }),
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
          {{ mode === 'create' ? 'Neuer Tag' : 'Tag bearbeiten' }}
        </DialogTitle>
        <DialogDescription>
          {{
            mode === 'create'
              ? 'Geben Sie einen Namen und optional eine Farbe ein.'
              : 'Bearbeiten Sie den Namen oder die Farbe des Tags.'
          }}
        </DialogDescription>
      </DialogHeader>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <div class="flex flex-col gap-2">
          <Label for="tag-name">Name</Label>
          <Input
            id="tag-name"
            v-model="name"
            placeholder="Tagname"
            :aria-invalid="!!error"
          />
          <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <Label>Farbe</Label>
          <div class="flex flex-wrap items-center gap-2">
            <!-- No color option -->
            <button
              type="button"
              class="border-muted-foreground flex size-7 items-center justify-center rounded-full border border-dashed transition-all"
              :class="
                color === null
                  ? 'ring-ring ring-offset-background ring-2 ring-offset-2'
                  : ''
              "
              title="Keine Farbe"
              @click="selectColor(null)"
            >
              <span v-if="color === null" class="text-muted-foreground text-xs">
                &times;
              </span>
            </button>

            <!-- Preset colors -->
            <button
              v-for="preset in presetColors"
              :key="preset.value"
              type="button"
              class="flex size-7 items-center justify-center rounded-full transition-all"
              :class="
                color === preset.value
                  ? 'ring-ring ring-offset-background ring-2 ring-offset-2'
                  : ''
              "
              :style="{ backgroundColor: preset.value }"
              :title="preset.name"
              @click="selectColor(preset.value)"
            >
              <Check
                v-if="color === preset.value"
                class="size-3.5 text-white"
              />
            </button>
          </div>
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
