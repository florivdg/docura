<script setup lang="ts">
import { ref } from 'vue'
import { ScanText, ChevronsUpDown } from 'lucide-vue-next'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
const { text } = defineProps<{ text: string | null }>()
const textContentOpen = ref(false)
function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}
</script>
<template>
  <!-- OCR text panel -->
  <Collapsible v-if="text" v-model:open="textContentOpen">
    <Card>
      <CollapsibleTrigger as-child>
        <CardHeader class="cursor-pointer select-none">
          <CardTitle class="flex items-center gap-2">
            <ScanText class="text-muted-foreground size-4" />
            Erkannter Text
          </CardTitle>
          <CardAction>
            <div class="flex items-center gap-2">
              <span class="text-muted-foreground text-xs font-normal">
                {{ wordCount(text).toLocaleString('de-DE') }}
                Wörter
              </span>
              <ChevronsUpDown class="text-muted-foreground size-4" />
            </div>
          </CardAction>
        </CardHeader>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <CardContent>
          <div class="bg-muted/30 max-h-80 overflow-y-auto rounded-md p-4">
            <p class="text-muted-foreground mb-2 text-xs italic">
              Automatisch extrahierter Text — kann Fehler enthalten.
            </p>
            <Separator class="mb-3" />
            <pre
              class="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap"
              >{{ text }}</pre>
          </div>
        </CardContent>
      </CollapsibleContent>
    </Card>
  </Collapsible>
</template>
