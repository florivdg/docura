<script setup lang="ts">
import { ref } from 'vue'
import { useDocumentResource } from '@/composables/useDocumentResource'
import { useDocumentActions } from '@/composables/useDocumentActions'
import { ArrowLeft, FileText, CircleAlert } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import DocumentPreview from './DocumentPreview.vue'
import DocumentText from './DocumentText.vue'
import DocumentProcessingHistory from './DocumentProcessingHistory.vue'
import DocumentActivityHistory from './DocumentActivityHistory.vue'
import DocumentMetadata from './DocumentMetadata.vue'
import DocumentToolbar from './DocumentToolbar.vue'
import DocumentStateBanner from './DocumentStateBanner.vue'
const props = defineProps<{
  documentId: string
}>()

/** Bumped after every save or reload; the history card reloads on change. */
const activityRevision = ref(0)
const {
  doc,
  loading,
  notFound,
  error,
  patchDocument,
  hasActiveProcessing,
  refetchDocument,
} = useDocumentResource(props.documentId, () => activityRevision.value++)
const {
  deleting,
  restoring,
  permanentlyDeleting,
  archiving,
  backUrl,
  toggleFavorite,
  handleRestore,
  handleDelete,
  handlePermanentDelete,
  handleArchive,
  handleUnarchive,
  reprocessing,
  handleReprocess,
} = useDocumentActions(props.documentId, doc, patchDocument, refetchDocument)
</script>

<template>
  <!-- Loading state -->
  <template v-if="loading">
    <div class="flex items-center justify-between">
      <Skeleton class="h-9 w-48" />
      <div class="flex gap-2">
        <Skeleton class="h-9 w-32" />
        <Skeleton class="h-9 w-24" />
      </div>
    </div>
    <div class="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
      <div class="flex flex-col gap-4 md:gap-6">
        <Skeleton class="h-[500px] rounded-lg" />
      </div>
      <div class="flex flex-col gap-4 md:gap-6">
        <Skeleton class="h-56 rounded-lg" />
        <Skeleton class="h-40 rounded-lg" />
      </div>
    </div>
  </template>

  <!-- Not found state -->
  <template v-else-if="notFound">
    <div class="flex flex-col items-center justify-center gap-4 py-20">
      <FileText class="text-muted-foreground size-12" />
      <p class="text-muted-foreground text-lg">Dokument nicht gefunden</p>
      <Button variant="outline" as-child>
        <a :href="backUrl">
          <ArrowLeft class="size-4" />
          Zurück zu Dokumente
        </a>
      </Button>
    </div>
  </template>

  <!-- Error state -->
  <template v-else-if="error">
    <div class="flex flex-col items-center justify-center gap-4 py-20">
      <CircleAlert class="text-muted-foreground size-12" />
      <p class="text-muted-foreground text-lg">
        Fehler beim Laden des Dokuments
      </p>
      <Button variant="outline" as-child>
        <a :href="backUrl">
          <ArrowLeft class="size-4" />
          Zurück zu Dokumente
        </a>
      </Button>
    </div>
  </template>

  <!-- Data state -->
  <template v-else-if="doc">
    <DocumentToolbar
      v-model:doc="doc"
      :back-url="backUrl"
      :archiving="archiving"
      :deleting="deleting"
      :processing="hasActiveProcessing"
      :reprocessing="reprocessing"
      :patch-document="patchDocument"
      @favorite="toggleFavorite"
      @archive="handleArchive"
      @delete="handleDelete"
      @reprocess="handleReprocess"
    />

    <DocumentStateBanner
      :doc="doc"
      :restoring="restoring"
      :permanently-deleting="permanentlyDeleting"
      :archiving="archiving"
      @restore="handleRestore"
      @permanent-delete="handlePermanentDelete"
      @unarchive="handleUnarchive"
    />

    <!-- Content -->
    <div class="grid gap-4 md:grid-cols-[1fr_360px] md:gap-6">
      <!-- Left column: Preview + OCR text -->
      <div class="flex flex-col gap-4 md:gap-6">
        <DocumentPreview :doc="doc" />

        <DocumentText :text="doc.textContent" />
      </div>

      <!-- Sidebar -->
      <div class="flex flex-col gap-4 md:gap-6">
        <DocumentMetadata v-model:doc="doc" :patch-document="patchDocument" />

        <DocumentProcessingHistory :jobs="doc.processingJobs" />

        <DocumentActivityHistory
          :document-id="documentId"
          :revision="activityRevision"
        />
      </div>
    </div>
  </template>
</template>
