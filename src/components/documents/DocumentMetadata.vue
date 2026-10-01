<script setup lang="ts">
import { useDocumentFields } from '@/composables/useDocumentFields'
import { useDocumentCorrespondent } from '@/composables/useDocumentCorrespondent'
import { useDocumentTags } from '@/composables/useDocumentTags'
import { formatDocumentTimestamp } from '@/lib/document-date'
import CorrespondentPicker from './CorrespondentPicker.vue'
import { formatFileSize } from '@/lib/format'
import { Plus, X } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import TagDialog from '@/components/tags/TagDialog.vue'
import type { DocumentData, PatchDocument } from '@/lib/document-detail'
const doc = defineModel<DocumentData>('doc', { required: true })
const { patchDocument } = defineProps<{ patchDocument: PatchDocument }>()
const {
  allFolders,
  NONE_SENTINEL,
  selectedFolderValue,
  handleFolderChange,
  handleDocumentDateChange,
  onDocumentDateInput,
} = useDocumentFields(doc, patchDocument)
const {
  allCorrespondents,
  correspondentPopoverOpen,
  correspondentSearch,
  creatingCorrespondent,
  handleCorrespondentSelect,
  handleCorrespondentCreate,
} = useDocumentCorrespondent(doc, patchDocument)
const {
  allTags,
  tagDialogOpen,
  isTagAssigned,
  handleTagToggle,
  handleTagRemove,
  handleTagCreated,
} = useDocumentTags(doc, patchDocument)
</script>
<template>
  <!-- Metadata card -->
  <Card>
    <CardHeader>
      <CardTitle>Metadaten</CardTitle>
    </CardHeader>
    <CardContent class="space-y-3">
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Typ</span>
        <span>{{ doc.mimeType }}</span>
      </div>
      <Separator />
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Größe</span>
        <span>{{ formatFileSize(doc.fileSize) }}</span>
      </div>
      <Separator />
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="text-muted-foreground">Korrespondent</span>
        <CorrespondentPicker
          v-model:open="correspondentPopoverOpen"
          v-model:search="correspondentSearch"
          :creating="creatingCorrespondent"
          :selected="doc.correspondent"
          :options="allCorrespondents"
          @select="handleCorrespondentSelect"
          @create="handleCorrespondentCreate"
        />
      </div>
      <Separator />
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted-foreground">Ordner</span>
        <Select
          :model-value="selectedFolderValue()"
          @update:model-value="handleFolderChange"
        >
          <SelectTrigger size="sm" class="h-7 w-auto max-w-[180px]">
            <SelectValue placeholder="Kein Ordner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="NONE_SENTINEL">Kein Ordner</SelectItem>
            <SelectItem v-for="f in allFolders" :key="f.id" :value="f.id">
              {{ f.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Separator />
      <div class="flex flex-col gap-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-muted-foreground">Tags</span>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon" class="size-6">
                <Plus class="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuLabel>Tags zuweisen</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                v-for="t in allTags"
                :key="t.id"
                :model-value="isTagAssigned(t.id)"
                @update:model-value="
                  (checked: boolean) => handleTagToggle(t.id, checked)
                "
              >
                <span class="flex items-center gap-2">
                  <span
                    v-if="t.color"
                    class="size-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: t.color }"
                  />
                  {{ t.name }}
                </span>
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem @click="tagDialogOpen = true">
                <Plus class="size-4" />
                Neuen Tag erstellen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div v-if="doc.tags.length > 0" class="flex flex-wrap gap-1">
          <Badge
            v-for="t in doc.tags"
            :key="t.id"
            variant="secondary"
            class="gap-1 pr-1"
            :style="
              t.color ? { backgroundColor: t.color + '20', color: t.color } : {}
            "
          >
            {{ t.name }}
            <button
              class="hover:bg-muted rounded-sm p-0.5"
              @click="handleTagRemove(t.id)"
            >
              <X class="size-3" />
            </button>
          </Badge>
        </div>
        <span v-else class="text-muted-foreground">—</span>
      </div>
      <Separator />
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="text-muted-foreground">Belegdatum</span>
        <div class="flex items-center gap-1">
          <Input
            type="date"
            :model-value="doc.documentDate ?? ''"
            class="h-7 w-[140px] px-2 py-0 text-sm"
            aria-label="Belegdatum"
            @change="onDocumentDateInput"
          />
          <Button
            v-if="doc.documentDate"
            variant="ghost"
            size="icon"
            class="size-6"
            title="Belegdatum entfernen"
            aria-label="Belegdatum entfernen"
            @click="handleDocumentDateChange(null)"
          >
            <X class="size-3" />
          </Button>
        </div>
      </div>
      <Separator />
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Hochgeladen</span>
        <span>{{ formatDocumentTimestamp(doc.createdAt) }}</span>
      </div>
      <Separator />
      <div class="flex justify-between text-sm">
        <span class="text-muted-foreground">Aktualisiert</span>
        <span>{{ formatDocumentTimestamp(doc.updatedAt) }}</span>
      </div>
    </CardContent>
  </Card>

  <TagDialog
    v-model:open="tagDialogOpen"
    mode="create"
    @saved="handleTagCreated"
  />
</template>
