<script setup lang="ts">
import { ref, watch } from 'vue'
import { Tag } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useMetadataOptions } from '@/composables/useMetadataOptions'
import OptionCommandList from './OptionCommandList.vue'

/** "Tags hinzufügen" for the selection: pick several tags, then apply. */
defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ apply: [tagIds: string[]] }>()
const open = ref(false)
const tagIds = ref<string[]>([])
const { tags, ensureLoaded } = useMetadataOptions()

watch(open, (isOpen) => {
  if (!isOpen) return
  tagIds.value = []
  void ensureLoaded()
})

function apply() {
  if (tagIds.value.length === 0) return
  const selected = [...tagIds.value]
  open.value = false
  emit('apply', selected)
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm" :disabled="disabled">
        <Tag class="size-4" />
        Tags hinzufügen
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-[240px] p-0">
      <OptionCommandList
        v-model="tagIds"
        :options="tags"
        placeholder="Tags suchen…"
      />
      <div class="border-t p-2">
        <Button
          size="sm"
          class="w-full"
          :disabled="tagIds.length === 0 || disabled"
          @click="apply"
        >
          Tags hinzufügen
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
