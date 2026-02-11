<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import { FileText, FolderOpen, Loader2, Sparkles, Text } from 'lucide-vue-next'
import { formatFileSize } from '@/lib/format'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useSearchCommand } from '@/composables/useSearchCommand'

const { isSearchOpen } = useSearchCommand()

type SearchMode = 'fulltext' | 'semantic'
const searchMode = ref<SearchMode>('fulltext')
const searchQuery = ref('')
const isLoading = ref(false)
const errorMessage = ref('')

interface SearchResult {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  folderName: string | null
  similarity?: number
  headline?: string | null
}

const results = ref<SearchResult[]>([])

async function performSearch(query: string) {
  if (!query.trim()) {
    results.value = []
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const params = new URLSearchParams({
      q: query,
      mode: searchMode.value,
      limit: '10',
    })
    const response = await fetch(`/api/documents/search?${params}`)
    const data = await response.json()

    if (!response.ok) {
      errorMessage.value = data.error || 'Suche fehlgeschlagen'
      results.value = []
      return
    }

    results.value = data.results
  } catch {
    errorMessage.value = 'Verbindungsfehler'
    results.value = []
  } finally {
    isLoading.value = false
  }
}

const debouncedSearch = useDebounceFn((query: string) => {
  performSearch(query)
}, 300)

watch(searchQuery, (query) => {
  debouncedSearch(query)
})

watch(searchMode, () => {
  if (searchQuery.value.trim()) {
    performSearch(searchQuery.value)
  }
})

watch(isSearchOpen, (open) => {
  if (!open) {
    searchQuery.value = ''
    results.value = []
    errorMessage.value = ''
  }
})

function selectResult(id: string) {
  isSearchOpen.value = false
  window.location.href = `/documents/${id}`
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault()
    isSearchOpen.value = !isSearchOpen.value
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

const hasQuery = computed(() => searchQuery.value.trim().length > 0)
</script>

<template>
  <CommandDialog
    v-model:open="isSearchOpen"
    title="Dokumentensuche"
    description="Dokumente nach Name oder Inhalt durchsuchen"
    :should-filter="false"
  >
    <CommandInput
      v-model="searchQuery"
      placeholder="Dokumente suchen..."
      class="pr-8"
    />
    <div class="flex gap-1 border-b px-3 py-2">
      <button
        :class="[
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          searchMode === 'fulltext'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        ]"
        @click="searchMode = 'fulltext'"
      >
        <Text class="mr-1 inline size-3" />
        Volltextsuche
      </button>
      <button
        :class="[
          'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
          searchMode === 'semantic'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        ]"
        @click="searchMode = 'semantic'"
      >
        <Sparkles class="mr-1 inline size-3" />
        Semantische Suche
      </button>
    </div>
    <CommandList>
      <div
        v-if="isLoading"
        class="text-muted-foreground flex items-center justify-center py-6 text-sm"
      >
        <Loader2 class="mr-2 size-4 animate-spin" />
        Suche läuft...
      </div>
      <div
        v-else-if="errorMessage"
        class="text-destructive py-6 text-center text-sm"
      >
        {{ errorMessage }}
      </div>
      <CommandEmpty v-else-if="hasQuery && results.length === 0">
        Keine Dokumente gefunden.
      </CommandEmpty>
      <div
        v-else-if="!hasQuery"
        class="text-muted-foreground py-6 text-center text-sm"
      >
        Suchbegriff eingeben, um Dokumente zu finden.
      </div>
      <CommandGroup v-if="results.length > 0">
        <CommandItem
          v-for="result in results"
          :key="result.id"
          :value="result.id"
          @select="selectResult(result.id)"
        >
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <div class="flex items-center gap-2">
              <FileText class="size-4 shrink-0" />
              <span class="truncate font-medium">{{ result.name }}</span>
            </div>
            <div class="text-muted-foreground flex items-center gap-2 text-xs">
              <span v-if="result.folderName" class="flex items-center gap-1">
                <FolderOpen class="size-3" />
                {{ result.folderName }}
              </span>
              <span>{{ formatFileSize(result.fileSize) }}</span>
              <span
                v-if="searchMode === 'semantic' && result.similarity != null"
                class="bg-accent rounded-sm px-1.5 py-0.5 font-mono"
              >
                {{ (result.similarity * 100).toFixed(0) }}%
              </span>
            </div>
            <p
              v-if="result.headline"
              class="text-muted-foreground line-clamp-1 text-xs"
              v-html="result.headline"
            />
          </div>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
