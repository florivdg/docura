<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import TagsTable from '@/components/tags/TagsTable.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <SiteHeader title="Tags" />
      <div class="flex flex-1 flex-col">
        <div class="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          <TagsTable />
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
