<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useDebounceFn } from '@vueuse/core'
import AppSidebar from '@/components/AppSidebar.vue'
import SectionCards from '@/components/SectionCards.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import RecentActivity from '@/components/dashboard/RecentActivity.vue'
import DocumentOverview from '@/components/dashboard/DocumentOverview.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useProcessingEvents } from '@/composables/useProcessingEvents'
import { useApiRequest } from '@/composables/useApiRequest'
import type { ActivityGroup } from '@/lib/activity'

interface DashboardStats {
  documentCount: number
  folderCount: number
  tagCount: number
  totalStorageBytes: number
}

interface TypeBreakdown {
  mimeType: string
  count: number
  totalSize: number
}

const loading = ref(true)
const stats = ref<DashboardStats | null>(null)
const activity = ref<ActivityGroup[]>([])
const documentsByType = ref<TypeBreakdown[]>([])

const statsRequest = useApiRequest()
const activityRequest = useApiRequest()

async function fetchStats() {
  const data = await statsRequest.run<{
    stats: DashboardStats
    documentsByType: TypeBreakdown[]
  }>('/api/dashboard/stats', 'Statistik konnte nicht geladen werden')
  if (!data) return
  stats.value = data.stats
  documentsByType.value = data.documentsByType
}

async function fetchActivity() {
  const data = await activityRequest.run<{ entries: ActivityGroup[] }>(
    '/api/activity',
    'Aktivitäten konnten nicht geladen werden',
  )
  if (data) activity.value = data.entries
}

async function fetchDashboard() {
  try {
    await Promise.all([fetchStats(), fetchActivity()])
  } finally {
    loading.value = false
  }
}

/** Shown above the cards; the cards keep their last data. */
const loadError = computed(
  () => statsRequest.error.value || activityRequest.error.value,
)

/** Trailing refetch: a queue finishing many jobs reloads once, not per job. */
const PROCESSING_REFETCH_DELAY_MS = 1500
const refetchAfterProcessing = useDebounceFn(
  fetchDashboard,
  PROCESSING_REFETCH_DELAY_MS,
)

// Finished runs change counts and add KI-Analyse entries; progress does not.
useProcessingEvents((event) => {
  if (event.type === 'completed' || event.type === 'failed')
    void refetchAfterProcessing()
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
            <p
              v-if="loadError"
              role="alert"
              class="text-destructive px-4 text-sm lg:px-6"
            >
              {{ loadError }}
            </p>
            <SectionCards :stats="stats" :loading="loading" />
            <div class="grid grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-2">
              <RecentActivity :entries="activity" :loading="loading" />
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
