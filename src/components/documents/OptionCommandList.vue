<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { selectDocument } from '@/lib/document-selection'

/** Searchable multi-select list of folders, tags or correspondents. */
defineProps<{
  options: { id: string; name: string; color?: string | null }[]
  placeholder: string
}>()
const selected = defineModel<string[]>({ required: true })

function toggle(id: string) {
  selected.value = selectDocument(
    id,
    selected.value,
    !selected.value.includes(id),
  )
}
</script>

<template>
  <Command>
    <CommandInput :placeholder="placeholder" />
    <CommandList>
      <CommandEmpty>Nicht gefunden</CommandEmpty>
      <CommandGroup>
        <CommandItem
          v-for="option in options"
          :key="option.id"
          :value="option.name"
          @select.prevent="toggle(option.id)"
        >
          <Check
            class="size-3.5"
            :class="selected.includes(option.id) ? 'opacity-100' : 'opacity-0'"
          />
          <span
            v-if="option.color"
            class="size-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: option.color }"
          />
          {{ option.name }}
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
</template>
