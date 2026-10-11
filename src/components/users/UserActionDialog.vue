<script setup lang="ts">
import { computed } from 'vue'
import {
  USER_ACTIONS,
  type AdminUserRow,
  type UserActionKind,
} from '@/composables/useUserAdmin'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'

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
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ copy?.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ copy?.description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
        <AlertDialogAction
          :class="
            copy?.destructive
              ? buttonVariants({ variant: 'destructive' })
              : undefined
          "
          @click="emit('confirm')"
        >
          {{ copy?.confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
