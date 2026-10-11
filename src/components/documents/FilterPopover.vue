<script setup lang="ts">
import type { Component } from 'vue'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import FilterTriggerButton from './FilterTriggerButton.vue'
import OptionCommandList from './OptionCommandList.vue'

/** Multi-select filter for one metadata kind (folders, tags, …). */
defineProps<{
  icon: Component
  label: string
  options: { id: string; name: string; color?: string | null }[]
}>()
const ids = defineModel<string[]>({ required: true })
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <FilterTriggerButton :icon="icon" :label="label" :count="ids.length" />
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[220px] p-0">
      <OptionCommandList
        v-model="ids"
        :options="options"
        placeholder="Suchen…"
      />
    </PopoverContent>
  </Popover>
</template>
