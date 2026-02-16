<script setup lang="ts">
import PageLayout from '@/components/PageLayout.vue'
import DocumentDetail from '@/components/documents/DocumentDetail.vue'

defineProps<{
  documentId: string
}>()
</script>

<template>
  <PageLayout title="Dokument">
    <DocumentDetail :document-id="documentId" />
  </PageLayout>
</template>
