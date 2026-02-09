<script setup lang="ts">
import { computed } from 'vue'
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
import { authClient } from '@/lib/auth-client'

import NavDocuments from '@/components/NavDocuments.vue'
import NavMain from '@/components/NavMain.vue'
import NavSecondary from '@/components/NavSecondary.vue'
import NavUser from '@/components/NavUser.vue'
import SearchCommand from '@/components/SearchCommand.vue'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useSearchCommand } from '@/composables/useSearchCommand'

const { openSearch } = useSearchCommand()

const session = authClient.useSession()

const userData = computed(() => {
  const user = session.value.data?.user
  return {
    name: user?.name ?? '',
    email: user?.email ?? '',
    avatar: user?.image ?? '',
  }
})

const currentPath = computed(() => {
  if (typeof window === 'undefined') return '/'
  return window.location.pathname || '/'
})

const navMain = [
  {
    title: 'Übersicht',
    url: '/',
    icon: LayoutDashboard,
  },
  {
    title: 'Dokumente',
    url: '/documents',
    icon: FileText,
  },
  {
    title: 'Ordner',
    url: '/folders',
    icon: FolderOpen,
  },
  {
    title: 'Tags',
    url: '/tags',
    icon: Tag,
  },
]

const navDocuments = [
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
]

const navSecondary = [
  {
    title: 'Einstellungen',
    url: '/account',
    icon: Settings,
  },
  {
    title: 'Hilfe',
    url: '#',
    icon: HelpCircle,
  },
]
</script>

<template>
  <Sidebar collapsible="offcanvas" variant="inset">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            as-child
            class="data-[slot=sidebar-menu-button]:p-1.5!"
          >
            <a href="/">
              <HardDrive class="size-5!" />
              <span class="text-base font-semibold">Docura</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="navMain" :current-path="currentPath" />
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton @click="openSearch">
                <Search />
                <span>Suche</span>
                <kbd
                  class="bg-muted text-muted-foreground ml-auto inline-flex h-5 items-center rounded px-1.5 font-mono text-[10px] font-medium"
                >
                  ⌘K
                </kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <NavDocuments :items="navDocuments" />
      <NavSecondary
        :items="navSecondary"
        :current-path="currentPath"
        class="mt-auto"
      />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="userData" />
    </SidebarFooter>
  </Sidebar>
  <SearchCommand />
</template>
