<script setup lang="ts">
import { ref, watch } from 'vue'
import { FolderInput } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useMetadataOptions } from '@/composables/useMetadataOptions'

/** "In Ordner verschieben" for the selection; `null` removes the folder. */
defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [folderId: string | null] }>()
const open = ref(false)
const { folders, ensureLoaded } = useMetadataOptions()

watch(open, (isOpen) => {
  if (isOpen) void ensureLoaded()
})

function select(folderId: string | null) {
  open.value = false
  emit('select', folderId)
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm" :disabled="disabled">
        <FolderInput class="size-4" />
        In Ordner verschieben
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[240px] p-0">
      <Command>
        <CommandInput placeholder="Ordner suchen…" />
        <CommandList>
          <CommandEmpty>Nicht gefunden</CommandEmpty>
          <CommandGroup>
            <CommandItem value="Kein Ordner" @select.prevent="select(null)">
              <span class="text-muted-foreground">Kein Ordner</span>
            </CommandItem>
            <CommandItem
              v-for="f in folders"
              :key="f.id"
              :value="f.name"
              @select.prevent="select(f.id)"
            >
              {{ f.name }}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
