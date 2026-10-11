<script setup lang="ts">
import { computed } from 'vue'
import {
  Archive,
  ArchiveRestore,
  FileX,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-vue-next'
import type {
  ActivityAction,
  ActivityEntry,
  ActivityGroup,
} from '@/lib/activity'
import { Badge } from '@/components/ui/badge'
import { changeLines, describeActivity } from '@/lib/activity-labels'
import { formatDocumentTimestamp } from '@/lib/document-date'
import { relativeTime } from '@/lib/relative-time'

/**
 * One audit-trail row: action icon, sentence (with an „Automatisch“ badge for
 * system actors), change lines and relative time (exact time in the tooltip). The default slot goes below the sentence,
 * e.g. the dashboard's document link.
 */
const { activity } = defineProps<{ activity: ActivityEntry | ActivityGroup }>()

const ICONS = {
  uploaded: Upload,
  updated: Pencil,
  archived: Archive,
  unarchived: ArchiveRestore,
  trashed: Trash2,
  restored: RotateCcw,
  deleted: FileX,
  reprocess_requested: RefreshCw,
} satisfies Record<ActivityAction, unknown>

// Change lines only describe a single document exactly.
const lines = computed(() =>
  'count' in activity && activity.count > 1
    ? []
    : changeLines(activity.changes),
)
</script>

<template>
  <li class="flex items-start gap-3">
    <div
      class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md"
    >
      <component
        :is="ICONS[activity.action]"
        class="text-muted-foreground size-4"
      />
    </div>
    <div class="min-w-0 flex-1 space-y-0.5">
      <p class="text-sm">
        {{ describeActivity(activity) }}
        <Badge
          v-if="activity.actorType === 'system'"
          as="span"
          variant="secondary"
          class="ml-1 align-middle"
          title="Automatische Aktion"
        >
          Automatisch
        </Badge>
      </p>
      <slot />
      <p
        v-for="line in lines"
        :key="line"
        class="text-muted-foreground text-xs break-words"
      >
        {{ line }}
      </p>
    </div>
    <time
      :datetime="activity.createdAt"
      :title="formatDocumentTimestamp(activity.createdAt)"
      class="text-muted-foreground shrink-0 text-xs"
    >
      {{ relativeTime(activity.createdAt) }}
    </time>
  </li>
</template>
