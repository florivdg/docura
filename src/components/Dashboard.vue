<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import SectionCards from '@/components/SectionCards.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import RecentActivity from '@/components/dashboard/RecentActivity.vue'
import DocumentOverview from '@/components/dashboard/DocumentOverview.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useProcessingEvents } from '@/composables/useProcessingEvents'

interface DashboardStats {
  documentCount: number
  folderCount: number
  tagCount: number
  totalStorageBytes: number
}

interface RecentDocument {
  id: string
  name: string
  mimeType: string
  fileSize: number
  createdAt: string
  folderName: string | null
  processingStatus: string | null
}

interface TypeBreakdown {
  mimeType: string
  count: number
  totalSize: number
}

const loading = ref(true)
const stats = ref<DashboardStats | null>(null)
const recentDocuments = ref<RecentDocument[]>([])
const documentsByType = ref<TypeBreakdown[]>([])

async function fetchDashboard() {
  try {
    const res = await fetch('/api/dashboard/stats')
    if (res.ok) {
      const data = await res.json()
      stats.value = data.stats
      recentDocuments.value = data.recentDocuments
      documentsByType.value = data.documentsByType
    }
  } finally {
    loading.value = false
  }
}

useProcessingEvents((event) => {
  const doc = recentDocuments.value.find((d) => d.id === event.documentId)
  if (doc) {
    doc.processingStatus = event.status
    if (event.type === 'completed' || event.type === 'failed') {
      void fetchDashboard()
    }
  } else {
    void fetchDashboard()
  }
})

function onDocumentUploaded() {
  void fetchDashboard()
}

onMounted(() => {
  void fetchDashboard()
  window.addEventListener('document-uploaded', onDocumentUploaded)
})

onUnmounted(() => {
  window.removeEventListener('document-uploaded', onDocumentUploaded)
})
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <SiteHeader />
      <div class="flex flex-1 flex-col">
        <div class="@container/main flex flex-1 flex-col gap-2">
          <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards :stats="stats" :loading="loading" />
            <div class="grid grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-2">
              <RecentActivity :documents="recentDocuments" :loading="loading" />
              <DocumentOverview
                :documents-by-type="documentsByType"
                :loading="loading"
              />
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
