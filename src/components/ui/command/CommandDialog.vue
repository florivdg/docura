<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from 'reka-ui'
import { reactiveOmit } from '@vueuse/core'
import { useForwardPropsEmits } from 'reka-ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import Command from './Command.vue'

const props = withDefaults(
  defineProps<
    DialogRootProps & {
      title?: string
      description?: string
      shouldFilter?: boolean
    }
  >(),
  {
    title: 'Command Palette',
    description: 'Search for a command to run...',
    shouldFilter: true,
  },
)
const emits = defineEmits<DialogRootEmits>()

const delegatedProps = reactiveOmit(
  props,
  'title',
  'description',
  'shouldFilter',
)
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <Dialog v-slot="slotProps" v-bind="forwarded">
    <DialogContent class="overflow-hidden p-0">
      <DialogHeader class="sr-only">
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription>{{ description }}</DialogDescription>
      </DialogHeader>
      <Command :should-filter="shouldFilter">
        <slot v-bind="slotProps" />
      </Command>
    </DialogContent>
  </Dialog>
</template>
