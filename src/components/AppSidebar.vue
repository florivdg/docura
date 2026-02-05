<script setup lang="ts">
import {
  FileText,
  FolderOpen,
  HardDrive,
  HelpCircle,
  LayoutDashboard,
  Search,
  Settings,
  Star,
  Tag,
  Trash2,
  Upload,
} from 'lucide-vue-next'

import NavDocuments from '@/components/NavDocuments.vue'
import NavMain from '@/components/NavMain.vue'
import NavSecondary from '@/components/NavSecondary.vue'
import NavUser from '@/components/NavUser.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const data = {
  user: {
    name: 'Max Mustermann',
    email: 'max@example.com',
    avatar: '',
  },
  navMain: [
    {
      title: 'Übersicht',
      url: '#',
      icon: LayoutDashboard,
    },
    {
      title: 'Dokumente',
      url: '#',
      icon: FileText,
    },
    {
      title: 'Ordner',
      url: '#',
      icon: FolderOpen,
    },
    {
      title: 'Tags',
      url: '#',
      icon: Tag,
    },
  ],
  navDocuments: [
    {
      name: 'Zuletzt hochgeladen',
      url: '#',
      icon: Upload,
    },
    {
      name: 'Favoriten',
      url: '#',
      icon: Star,
    },
    {
      name: 'Papierkorb',
      url: '#',
      icon: Trash2,
    },
  ],
  navSecondary: [
    {
      title: 'Einstellungen',
      url: '#',
      icon: Settings,
    },
    {
      title: 'Hilfe',
      url: '#',
      icon: HelpCircle,
    },
    {
      title: 'Suche',
      url: '#',
      icon: Search,
    },
  ],
}
</script>

<template>
  <Sidebar collapsible="offcanvas" variant="inset">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            as-child
            class="data-[slot=sidebar-menu-button]:!p-1.5"
          >
            <a href="#">
              <HardDrive class="!size-5" />
              <span class="text-base font-semibold">Docura</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="data.navMain" />
      <NavDocuments :items="data.navDocuments" />
      <NavSecondary :items="data.navSecondary" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="data.user" />
    </SidebarFooter>
  </Sidebar>
</template>
