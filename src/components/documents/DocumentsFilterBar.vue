<script setup lang="ts">
import { onMounted } from 'vue'
import {
  Building2,
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
import { selectDocument } from '@/lib/document-selection'
import FilterPopover from './FilterPopover.vue'
import FilterTriggerButton from './FilterTriggerButton.vue'

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

defineProps<{
  hasActiveFilters: boolean
}>()

const emit = defineEmits<{
  clear: []
}>()

const { folders, tags, correspondents, ensureLoaded } = useMetadataOptions()

const searchModes = [
  { value: 'fulltext', icon: Text, label: 'Volltextsuche' },
  { value: 'semantic', icon: Sparkles, label: 'Semantische Suche' },
] as const

const statusOptions = [
  { value: 'pending', label: 'Ausstehend' },
  { value: 'processing', label: 'Verarbeitung' },
  { value: 'completed', label: 'Abgeschlossen' },
  { value: 'failed', label: 'Fehlgeschlagen' },
]

function setStatus(value: string, checked: boolean | 'indeterminate') {
  statuses.value = selectDocument(value, statuses.value, checked)
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
        <TooltipProvider
          v-for="mode in searchModes"
          :key="mode.value"
          :delay-duration="300"
        >
          <Tooltip>
            <TooltipTrigger as-child>
              <button
                type="button"
                class="inline-flex size-7 items-center justify-center rounded-md transition-colors"
                :class="
                  searchMode === mode.value
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                "
                :aria-pressed="searchMode === mode.value"
                @click="searchMode = mode.value"
              >
                <component :is="mode.icon" class="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ mode.label }}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>

    <!-- Filter buttons -->
    <div class="flex items-center gap-1.5">
      <FilterPopover
        v-model="folderIds"
        :icon="FolderOpen"
        label="Ordner"
        :options="folders"
      />
      <FilterPopover
        v-model="correspondentIds"
        :icon="Building2"
        label="Korrespondent"
        :options="correspondents"
      />
      <FilterPopover
        v-model="tagIds"
        :icon="Tag"
        label="Tags"
        :options="tags"
      />

      <!-- Status filter -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <FilterTriggerButton
            :icon="CircleDot"
            label="Status"
            :count="statuses.length"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuCheckboxItem
            v-for="opt in statusOptions"
            :key="opt.value"
            :model-value="statuses.includes(opt.value)"
            @update:model-value="(checked) => setStatus(opt.value, checked)"
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
