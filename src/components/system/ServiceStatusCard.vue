<script setup lang="ts">
import { computed } from 'vue'
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  TriangleAlert,
} from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SUCCESS_BADGE_CLASS } from '@/lib/processing'
import type { CardState, ServiceCard } from '@/lib/system-status-view'

const { card } = defineProps<{ card: ServiceCard }>()

const STATE_STYLES: Record<
  CardState,
  {
    icon: typeof CircleCheck
    variant: 'outline' | 'destructive'
    class: string
  }
> = {
  ok: {
    icon: CircleCheck,
    variant: 'outline',
    class: SUCCESS_BADGE_CLASS,
  },
  warning: {
    icon: TriangleAlert,
    variant: 'outline',
    class: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  },
  error: { icon: CircleAlert, variant: 'destructive', class: '' },
  unknown: { icon: CircleHelp, variant: 'outline', class: '' },
}
const style = computed(() => STATE_STYLES[card.state])
</script>

<template>
  <Card :data-service="card.key">
    <CardHeader class="flex flex-row items-center justify-between gap-2">
      <CardTitle>{{ card.title }}</CardTitle>
      <Badge :variant="style.variant" :class="style.class">
        <component :is="style.icon" class="size-3" />
        {{ card.label }}
      </Badge>
    </CardHeader>
    <CardContent>
      <ul class="text-muted-foreground space-y-1 text-sm">
        <li v-for="detail in card.details" :key="detail">{{ detail }}</li>
      </ul>
    </CardContent>
  </Card>
</template>
