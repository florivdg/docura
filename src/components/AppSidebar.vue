<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const userData = ref({
  name: '',
  email: '',
  avatar: '',
})

onMounted(async () => {
  const { data } = await authClient.getSession()
  if (data?.user) {
    userData.value = {
      name: data.user.name,
      email: data.user.email,
      avatar: data.user.image ?? '',
    }
  }
})

const navMain = [
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
            <a href="#">
              <HardDrive class="size-5!" />
              <span class="text-base font-semibold">Docura</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <NavMain :items="navMain" />
      <NavDocuments :items="navDocuments" />
      <NavSecondary :items="navSecondary" class="mt-auto" />
    </SidebarContent>
    <SidebarFooter>
      <NavUser :user="userData" />
    </SidebarFooter>
  </Sidebar>
</template>
