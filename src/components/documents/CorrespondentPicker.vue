<script setup lang="ts">
import { Check, Plus, ChevronsUpDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import type { DocumentCorrespondent } from '@/lib/document-detail'
const open = defineModel<boolean>('open', { required: true })
const search = defineModel<string>('search', { required: true })
const { creating, selected, options } = defineProps<{ creating: boolean; selected: DocumentCorrespondent | null; options: DocumentCorrespondent[] }>()
const emit = defineEmits<{ create: []; select: [value: DocumentCorrespondent | null] }>()
</script>
<template>
        <Popover v-model:open="open">
          <PopoverTrigger as-child>
            <Button
              variant="outline"
              size="sm"
              class="h-7 w-auto max-w-[180px] justify-between gap-1 px-2 font-normal"
            >
              <span class="truncate">
                {{ selected?.name ?? 'Kein Korrespondent' }}
              </span>
              <ChevronsUpDown class="size-3.5 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" class="w-[240px] p-0">
            <Command>
              <CommandInput
                v-model="search"
                placeholder="Suchen oder erstellen…"
              />
              <CommandList>
                <CommandEmpty>
                  <button
                    v-if="search.trim()"
                    type="button"
                    class="hover:bg-accent hover:text-accent-foreground mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:opacity-50"
                    :disabled="creating"
                    @click="emit('create')"
                  >
                    <Plus class="size-3.5 shrink-0" />
                    <span class="truncate">
                      „{{ search.trim() }}" erstellen
                    </span>
                  </button>
                  <span v-else>Nicht gefunden</span>
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="Kein Korrespondent"
                    @select.prevent="emit('select', null)"
                  >
                    <Check
                      class="size-3.5"
                      :class="selected ? 'opacity-0' : 'opacity-100'"
                    />
                    Kein Korrespondent
                  </CommandItem>
                  <CommandItem
                    v-for="c in options"
                    :key="c.id"
                    :value="c.name"
                    @select.prevent="emit('select', c)"
                  >
                    <Check
                      class="size-3.5"
                      :class="
                        selected?.id === c.id
                          ? 'opacity-100'
                          : 'opacity-0'
                      "
                    />
                    {{ c.name }}
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
</template>
