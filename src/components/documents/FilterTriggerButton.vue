<script setup lang="ts">
import type { Component } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** Filter button that highlights itself and shows how many values are set. */
defineProps<{ icon: Component; label: string; count: number }>()
</script>

<template>
  <Button
    variant="outline"
    size="default"
    :class="count > 0 ? 'border-primary/50 bg-primary/5' : ''"
  >
    <component :is="icon" class="size-3.5" />
    {{ label }}
    <Badge
      v-if="count > 0"
      variant="secondary"
      class="ml-1 h-5 px-1.5 text-[10px]"
    >
      {{ count }}
    </Badge>
  </Button>
</template>
