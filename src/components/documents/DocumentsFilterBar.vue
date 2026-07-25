<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  Building2,
  Check,
  CircleDot,
  FolderOpen,
  Search,
  Sparkles,
  Tag,
  Text,
  X,
} from 'lucide-vue-next'
import { useMetadataOptions } from '@/composables/useMetadataOptions'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandGroup,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const query = defineModel<string>('query', { required: true })
const searchMode = defineModel<'fulltext' | 'semantic'>('searchMode', {
  required: true,
})
const folderIds = defineModel<string[]>('folderIds', { required: true })
const tagIds = defineModel<string[]>('tagIds', { required: true })
const correspondentIds = defineModel<string[]>('correspondentIds', {
  required: true,
})
const statuses = defineModel<string[]>('statuses', { required: true })

const props = defineProps<{
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  clear: []
}>()

const { folders, tags, correspondents, ensureLoaded } = useMetadataOptions()

const folderPopoverOpen = ref(false)
const tagPopoverOpen = ref(false)
const correspondentPopoverOpen = ref(false)

const statusOptions = [
  { value: 'pending', label: 'Ausstehend' },
  { value: 'processing', label: 'Verarbeitung' },
  { value: 'completed', label: 'Abgeschlossen' },
  { value: 'failed', label: 'Fehlgeschlagen' },
]

function toggleFolder(id: string) {
  const idx = folderIds.value.indexOf(id)
  if (idx >= 0) {
    folderIds.value = folderIds.value.filter((f) => f !== id)
  } else {
    folderIds.value = [...folderIds.value, id]
  }
}

function toggleTag(id: string) {
  const idx = tagIds.value.indexOf(id)
  if (idx >= 0) {
    tagIds.value = tagIds.value.filter((t) => t !== id)
  } else {
    tagIds.value = [...tagIds.value, id]
  }
}

function toggleCorrespondent(id: string) {
  const idx = correspondentIds.value.indexOf(id)
  if (idx >= 0) {
    correspondentIds.value = correspondentIds.value.filter((c) => c !== id)
  } else {
    correspondentIds.value = [...correspondentIds.value, id]
  }
}

function toggleStatus(value: string) {
  const idx = statuses.value.indexOf(value)
  if (idx >= 0) {
    statuses.value = statuses.value.filter((s) => s !== value)
  } else {
    statuses.value = [...statuses.value, value]
  }
}

onMounted(() => {
  void ensureLoaded()
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <!-- Search input with mode toggle -->
    <div class="relative min-w-[200px] flex-1">
      <Search
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <Input
        v-model="query"
        placeholder="Dokumente durchsuchen…"
        class="pr-[72px] pl-9"
      />
      <div class="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5">
        <TooltipProvider :delay-duration="300">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="inline-flex size-7 items-center justify-center rounded-md transition-colors"
                :class="
                  searchMode === 'fulltext'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-pressed="searchMode === 'fulltext'"
                @click="searchMode = 'fulltext'"
              >
                <Text class="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Volltextsuche</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <TooltipProvider :delay-duration="300">
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="inline-flex size-7 items-center justify-center rounded-md transition-colors"
                :class="
                  searchMode === 'semantic'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-pressed="searchMode === 'semantic'"
                @click="searchMode = 'semantic'"
              >
                <Sparkles class="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Semantische Suche</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <!-- Filter buttons -->
    <div class="flex items-center gap-1.5">
      <!-- Folder filter -->
      <Popover v-model:open="folderPopoverOpen">
        <PopoverTrigger as-child>
          <Button
            variant="outline"
            size="default"
            :class="
              folderIds.length > 0 ? 'border-primary/50 bg-primary/5' : ''
            "
          >
            <FolderOpen class="size-3.5" />
            Ordner
            <Badge
              v-if="folderIds.length > 0"
              variant="secondary"
              class="ml-1 h-5 px-1.5 text-[10px]"
            >
              {{ folderIds.length }}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-[220px] p-0">
          <Command>
            <CommandInput placeholder="Suchen…" />
            <CommandList>
              <CommandEmpty>Nicht gefunden</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-for="f in folders"
                  :key="f.id"
                  :value="f.name"
                  @select.prevent="toggleFolder(f.id)"
                >
                  <Check
                    class="size-3.5"
                    :class="
                      folderIds.includes(f.id) ? 'opacity-100' : 'opacity-0'
                    "
                  />
                  {{ f.name }}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <!-- Correspondent filter -->
      <Popover v-model:open="correspondentPopoverOpen">
        <PopoverTrigger as-child>
          <Button
            variant="outline"
            size="default"
            :class="
              correspondentIds.length > 0
                ? 'border-primary/50 bg-primary/5'
                : ''
            "
          >
            <Building2 class="size-3.5" />
            Korrespondent
            <Badge
              v-if="correspondentIds.length > 0"
              variant="secondary"
              class="ml-1 h-5 px-1.5 text-[10px]"
            >
              {{ correspondentIds.length }}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-[220px] p-0">
          <Command>
            <CommandInput placeholder="Suchen…" />
            <CommandList>
              <CommandEmpty>Nicht gefunden</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-for="c in correspondents"
                  :key="c.id"
                  :value="c.name"
                  @select.prevent="toggleCorrespondent(c.id)"
                >
                  <Check
                    class="size-3.5"
                    :class="
                      correspondentIds.includes(c.id)
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

      <!-- Tag filter -->
      <Popover v-model:open="tagPopoverOpen">
        <PopoverTrigger as-child>
          <Button
            variant="outline"
            size="default"
            :class="tagIds.length > 0 ? 'border-primary/50 bg-primary/5' : ''"
          >
            <Tag class="size-3.5" />
            Tags
            <Badge
              v-if="tagIds.length > 0"
              variant="secondary"
              class="ml-1 h-5 px-1.5 text-[10px]"
            >
              {{ tagIds.length }}
            </Badge>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-[220px] p-0">
          <Command>
            <CommandInput placeholder="Suchen…" />
            <CommandList>
              <CommandEmpty>Nicht gefunden</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  v-for="t in tags"
                  :key="t.id"
                  :value="t.name"
                  @select.prevent="toggleTag(t.id)"
                >
                  <Check
                    class="size-3.5"
                    :class="tagIds.includes(t.id) ? 'opacity-100' : 'opacity-0'"
                  />
                  <span
                    v-if="t.color"
                    class="size-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: t.color }"
                  />
                  {{ t.name }}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <!-- Status filter -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="default"
            :class="statuses.length > 0 ? 'border-primary/50 bg-primary/5' : ''"
          >
            <CircleDot class="size-3.5" />
            Status
            <Badge
              v-if="statuses.length > 0"
              variant="secondary"
              class="ml-1 h-5 px-1.5 text-[10px]"
            >
              {{ statuses.length }}
            </Badge>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            v-for="opt in statusOptions"
            :key="opt.value"
            :model-value="statuses.includes(opt.value)"
            @update:model-value="toggleStatus(opt.value)"
          >
            {{ opt.label }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Reset button -->
      <TooltipProvider v-if="hasActiveFilters" :delay-duration="300">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="ghost" size="icon" @click="emit('clear')">
              <X class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Filter zurücksetzen</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  </div>
</template>
