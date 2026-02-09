<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import DocumentDetail from '@/components/documents/DocumentDetail.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

defineProps<{
  documentId: string
}>()
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <SiteHeader title="Dokument" />
      <div class="flex flex-1 flex-col">
        <div class="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          <DocumentDetail :document-id="documentId" />
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
