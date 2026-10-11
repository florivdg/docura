<script setup lang="ts">
import { computed } from 'vue'
import {
  USER_ACTIONS,
  type AdminUserRow,
  type UserActionKind,
} from '@/composables/useUserAdmin'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps<{
  pending: { kind: UserActionKind; user: AdminUserRow } | null
}>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ confirm: [] }>()

const copy = computed(() => {
  if (!props.pending) return null
  const action = USER_ACTIONS[props.pending.kind]
  return { ...action, description: action.description(props.pending.user.name) }
})
</script>

<template>
  <ConfirmDialog
    v-model:open="open"
    :title="copy?.title ?? ''"
    :description="copy?.description ?? ''"
    :confirm-label="copy?.confirmLabel ?? ''"
    :destructive="copy?.destructive"
    @confirm="emit('confirm')"
  />
</template>
