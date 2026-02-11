<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  Image,
  Loader2,
} from 'lucide-vue-next'
import { formatFileSize } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface DocumentTag {
  id: string
  name: string
  color: string | null
}

interface DocumentRow {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  updatedAt: string
  folderName: string | null
  tags: DocumentTag[]
  processingStatus: string | null
  processingStep: string | null
  processingError: string | null
}

const documents = ref<DocumentRow[]>([])
const loading = ref(true)

const statusConfig: Record<
  string,
  {
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
    label: string
    class?: string
  }
> = {
  pending: { variant: 'secondary', label: 'Ausstehend' },
  processing: { variant: 'default', label: 'Verarbeitung' },
  completed: {
    variant: 'outline',
    label: 'Abgeschlossen',
    class: 'border-green-500/30 bg-green-500/10 text-green-400',
  },
  failed: { variant: 'destructive', label: 'Fehlgeschlagen' },
}

const stepLabels: Record<string, string> = {
  text_extraction: 'Textextraktion',
  ocr: 'Texterkennung',
  embedding: 'Einbettung',
}

const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatDate(dateStr: string): string {
  return dateFormatter.format(new Date(dateStr))
}

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/')
}

onMounted(async () => {
  try {
    const res = await fetch('/api/documents')
    const data = await res.json()
    documents.value = data.documents
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Ordner</TableHead>
        <TableHead>Tags</TableHead>
        <TableHead>Größe</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Hochgeladen</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <template v-if="loading">
        <TableRow v-for="i in 5" :key="i">
          <TableCell>
            <div class="flex items-center gap-2">
              <Skeleton class="h-4 w-4" />
              <Skeleton class="h-4 w-32" />
            </div>
          </TableCell>
          <TableCell><Skeleton class="h-4 w-20" /></TableCell>
          <TableCell>
            <div class="flex gap-1">
              <Skeleton class="h-5 w-14" />
              <Skeleton class="h-5 w-14" />
            </div>
          </TableCell>
          <TableCell><Skeleton class="h-4 w-16" /></TableCell>
          <TableCell><Skeleton class="h-5 w-24" /></TableCell>
          <TableCell><Skeleton class="h-4 w-28" /></TableCell>
        </TableRow>
      </template>
      <template v-else-if="documents.length === 0">
        <TableEmpty :colspan="6">
          <div class="flex flex-col items-center gap-2">
            <FileText class="text-muted-foreground size-8" />
            <p class="text-muted-foreground text-sm">
              Noch keine Dokumente vorhanden
            </p>
          </div>
        </TableEmpty>
      </template>
      <template v-else>
        <TableRow v-for="doc in documents" :key="doc.id">
          <TableCell>
            <div class="flex items-center gap-2">
              <component
                :is="isImageMime(doc.mimeType) ? Image : FileText"
                class="text-muted-foreground size-4 shrink-0"
              />
              <a
                :href="`/documents/${doc.id}`"
                class="truncate hover:underline"
              >
                {{ doc.name }}
              </a>
            </div>
          </TableCell>
          <TableCell>
            <span v-if="doc.folderName">{{ doc.folderName }}</span>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
          <TableCell>
            <div v-if="doc.tags.length > 0" class="flex flex-wrap gap-1">
              <Badge
                v-for="t in doc.tags"
                :key="t.id"
                variant="outline"
                class="gap-1 text-xs"
              >
                <span
                  v-if="t.color"
                  class="size-2 shrink-0 rounded-full"
                  :style="{ backgroundColor: t.color }"
                />
                {{ t.name }}
              </Badge>
            </div>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
          <TableCell class="whitespace-nowrap">
            {{ formatFileSize(doc.fileSize) }}
          </TableCell>
          <TableCell>
            <template v-if="doc.processingStatus">
              <TooltipProvider v-if="doc.processingStep">
                <Tooltip>
                  <TooltipTrigger as-child>
                    <Badge
                      :variant="
                        statusConfig[doc.processingStatus]?.variant ??
                        'secondary'
                      "
                      :class="statusConfig[doc.processingStatus]?.class"
                    >
                      <Clock
                        v-if="doc.processingStatus === 'pending'"
                        class="size-3"
                      />
                      <Loader2
                        v-else-if="doc.processingStatus === 'processing'"
                        class="size-3 animate-spin"
                      />
                      <CheckCircle2
                        v-else-if="doc.processingStatus === 'completed'"
                        class="size-3"
                      />
                      <CircleAlert
                        v-else-if="doc.processingStatus === 'failed'"
                        class="size-3"
                      />
                      {{
                        statusConfig[doc.processingStatus]?.label ??
                        doc.processingStatus
                      }}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {{ stepLabels[doc.processingStep] ?? doc.processingStep }}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Badge
                v-else
                :variant="
                  statusConfig[doc.processingStatus]?.variant ?? 'secondary'
                "
                :class="statusConfig[doc.processingStatus]?.class"
              >
                <Clock
                  v-if="doc.processingStatus === 'pending'"
                  class="size-3"
                />
                <Loader2
                  v-else-if="doc.processingStatus === 'processing'"
                  class="size-3 animate-spin"
                />
                <CheckCircle2
                  v-else-if="doc.processingStatus === 'completed'"
                  class="size-3"
                />
                <CircleAlert
                  v-else-if="doc.processingStatus === 'failed'"
                  class="size-3"
                />
                {{
                  statusConfig[doc.processingStatus]?.label ??
                  doc.processingStatus
                }}
              </Badge>
            </template>
            <span v-else class="text-muted-foreground">—</span>
          </TableCell>
          <TableCell class="whitespace-nowrap">
            {{ formatDate(doc.createdAt) }}
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </Table>
</template>
