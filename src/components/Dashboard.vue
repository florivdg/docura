<script setup lang="ts">
import AppSidebar from '@/components/AppSidebar.vue'
import SectionCards from '@/components/SectionCards.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
</script>

<template>
  <SidebarProvider>
    <AppSidebar />
    <SidebarInset>
      <SiteHeader />
      <div class="flex flex-1 flex-col">
        <div class="@container/main flex flex-1 flex-col gap-2">
          <div class="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards />
            <div class="grid grid-cols-1 gap-4 px-4 lg:px-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Letzte Aktivität</CardTitle>
                  <CardDescription>
                    Übersicht über die letzten Dokumentenaktivitäten
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    class="flex h-[250px] items-center justify-center rounded-lg border border-dashed"
                  >
                    <p class="text-muted-foreground text-sm">
                      Hier wird die Aktivitätsübersicht angezeigt
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Dokumentenübersicht</CardTitle>
                  <CardDescription>
                    Ihre zuletzt bearbeiteten Dokumente
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    class="flex h-[250px] items-center justify-center rounded-lg border border-dashed"
                  >
                    <p class="text-muted-foreground text-sm">
                      Hier werden Ihre Dokumente angezeigt
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
