<script setup lang="ts">
import { ref } from 'vue'
import { CirclePlus, FileUp } from 'lucide-vue-next'

import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { type NavItem, isNavItemActive } from '@/lib/nav'
import UploadDialog from '@/components/documents/UploadDialog.vue'

const props = withDefaults(
  defineProps<{
    items: NavItem[]
    currentPath: string
    maxFileSizeMb?: number
  }>(),
  { maxFileSizeMb: 50 },
)

const uploadOpen = ref(false)
</script>

<template>
  <SidebarGroup>
    <SidebarGroupContent class="flex flex-col gap-2">
      <SidebarMenu>
        <SidebarMenuItem class="flex items-center gap-2">
          <SidebarMenuButton
            tooltip="Dokument hochladen"
            class="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear"
            @click="uploadOpen = true"
          >
            <CirclePlus />
            <span>Neues Dokument</span>
          </SidebarMenuButton>
          <Button
            size="icon"
            class="size-8 group-data-[collapsible=icon]:opacity-0"
            variant="outline"
            @click="uploadOpen = true"
          >
            <FileUp />
            <span class="sr-only">Hochladen</span>
          </Button>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in items" :key="item.title">
          <SidebarMenuButton
            as-child
            :tooltip="item.title"
            :is-active="isNavItemActive(item, props.currentPath)"
          >
            <a :href="item.url">
              <component :is="item.icon" v-if="item.icon" />
              <span>{{ item.title }}</span>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
  <UploadDialog
    v-model:open="uploadOpen"
    :max-file-size-mb="props.maxFileSizeMb"
  />
</template>
