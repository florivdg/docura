<script setup lang="ts">
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { documentCountLabel } from '@/lib/format'

/** Result count, page size selector and page navigation below the list. */
defineProps<{ totalCount: number; currentPage: number; totalPages: number }>()
const pageSize = defineModel<20 | 50 | 100>('pageSize', { required: true })
const emit = defineEmits<{ page: [page: number] }>()
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="text-muted-foreground flex items-center gap-2 text-sm">
      <span>{{ documentCountLabel(totalCount) }}</span>
      <span class="text-muted-foreground/50">|</span>
      <span>Zeilen pro Seite:</span>
      <Select
        :model-value="String(pageSize)"
        @update:model-value="(v) => (pageSize = Number(v) as 20 | 50 | 100)"
      >
        <SelectTrigger class="h-8 w-[80px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="20">20</SelectItem>
          <SelectItem value="50">50</SelectItem>
          <SelectItem value="100">100</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Pagination
      v-if="totalPages > 1"
      :total="totalCount"
      :items-per-page="pageSize"
      :page="currentPage"
      :sibling-count="1"
      @update:page="(page: number) => emit('page', page)"
    >
      <PaginationContent v-slot="{ items }">
        <PaginationFirst />
        <PaginationPrevious />
        <template v-for="(item, index) in items" :key="index">
          <PaginationItem
            v-if="item.type === 'page'"
            :value="item.value"
            :is-active="item.value === currentPage"
          >
            {{ item.value }}
          </PaginationItem>
          <PaginationEllipsis v-else :index="index" />
        </template>
        <PaginationNext />
        <PaginationLast />
      </PaginationContent>
    </Pagination>
  </div>
</template>
