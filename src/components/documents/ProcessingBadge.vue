<script setup lang="ts">
import { computed } from 'vue'
import { Clock, Loader2, CheckCircle2, CircleAlert } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { statusConfig, stepLabels } from '@/lib/processing'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
const { status, step } = defineProps<{ status: string; step?: string | null }>()
const icons = { pending: Clock, processing: Loader2, completed: CheckCircle2, failed: CircleAlert }
const icon = computed(() => icons[status as keyof typeof icons])
</script>
<template>
  <TooltipProvider v-if="step">
    <Tooltip>
      <TooltipTrigger as-child>
        <Badge :variant="statusConfig[status]?.variant ?? 'secondary'" :class="statusConfig[status]?.class">
          <component :is="icon" v-if="icon" class="size-3" :class="{ 'animate-spin': status === 'processing' }" />
          {{ statusConfig[status]?.label ?? status }}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{{ stepLabels[step] ?? step }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <Badge v-else :variant="statusConfig[status]?.variant ?? 'secondary'" :class="statusConfig[status]?.class">
    <component :is="icon" v-if="icon" class="size-3" :class="{ 'animate-spin': status === 'processing' }" />
    {{ statusConfig[status]?.label ?? status }}
  </Badge>
</template>
