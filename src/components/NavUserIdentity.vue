<script setup lang="ts">
import { computed } from 'vue'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export interface NavUserData {
  name: string
  email: string
  avatar: string
}

/** Avatar with name and e-mail, as shown in the sidebar user menu. */
const props = defineProps<{
  user: NavUserData
  grayscale?: boolean
}>()

const initials = computed(() =>
  props.user.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join(''),
)
</script>

<template>
  <Avatar class="h-8 w-8 rounded-lg" :class="{ grayscale }">
    <AvatarImage :src="user.avatar" :alt="user.name" />
    <AvatarFallback class="rounded-lg">
      {{ initials }}
    </AvatarFallback>
  </Avatar>
  <div class="grid flex-1 text-left text-sm leading-tight">
    <span class="truncate font-medium">{{ user.name }}</span>
    <span class="text-muted-foreground truncate text-xs">
      {{ user.email }}
    </span>
  </div>
</template>
