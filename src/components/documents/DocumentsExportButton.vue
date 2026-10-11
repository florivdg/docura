<script setup lang="ts">
import { computed } from 'vue'
import { Download } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/** Downloads everything the list currently shows as a ZIP. */
const { href, totalCount, semanticSearch, maxDocuments } = defineProps<{
  href: string
  totalCount: number
  semanticSearch: boolean
  /** Server limit (EXPORT_MAX_DOCUMENTS); larger exports are rejected with 413. */
  maxDocuments?: number
}>()

const disabledReason = computed(() => {
  if (semanticSearch) return 'Nicht verfügbar bei semantischer Suche'
  if (totalCount === 0) return 'Keine Dokumente zum Exportieren'
  if (maxDocuments !== undefined && totalCount > maxDocuments)
    return `Zu viele Dokumente für den Export (höchstens ${maxDocuments}) – bitte Auswahl einschränken`
  return null
})
const label = computed(() => `Exportieren (${totalCount})`)
</script>

<template>
  <div class="flex justify-end">
    <TooltipProvider v-if="disabledReason">
      <Tooltip>
        <TooltipTrigger as-child>
          <!-- A disabled button gets no pointer events; the wrapper shows the reason. -->
          <span tabindex="0" data-testid="export-disabled">
            <Button variant="outline" size="sm" disabled>
              <Download class="size-4" />
              {{ label }}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>{{ disabledReason }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <Button v-else variant="outline" size="sm" as-child>
      <a :href download title="Alle angezeigten Dokumente als ZIP exportieren">
        <Download class="size-4" />
        {{ label }}
      </a>
    </Button>
  </div>
</template>
