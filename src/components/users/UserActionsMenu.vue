<script setup lang="ts">
import {
  EllipsisVertical,
  KeyRound,
  Lock,
  LockOpen,
  ShieldCheck,
  ShieldOff,
  Trash2,
} from 'lucide-vue-next'
import type { AdminUserRow, UserActionKind } from '@/composables/useUserAdmin'
import { isAdmin } from '@/lib/roles'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Row actions; disabled for the signed-in admin to prevent self-lockout. */
const props = defineProps<{ user: AdminUserRow; self: boolean }>()
const emit = defineEmits<{ action: [kind: UserActionKind]; password: [] }>()
</script>

<template>
  <DropdownMenu :modal="false">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        :disabled="props.self"
        :title="
          props.self
            ? 'Das eigene Konto verwalten Sie unter Einstellungen.'
            : 'Aktionen'
        "
      >
        <EllipsisVertical class="size-4" />
        <span class="sr-only">Aktionen für {{ props.user.name }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('password')">
        <KeyRound />
        Passwort setzen
      </DropdownMenuItem>
      <DropdownMenuItem
        v-if="isAdmin(props.user)"
        @select="emit('action', 'demote')"
      >
        <ShieldOff />
        Administratorrechte entziehen
      </DropdownMenuItem>
      <DropdownMenuItem v-else @select="emit('action', 'promote')">
        <ShieldCheck />
        Zum Administrator ernennen
      </DropdownMenuItem>
      <DropdownMenuItem
        v-if="props.user.banned"
        @select="emit('action', 'unban')"
      >
        <LockOpen />
        Sperre aufheben
      </DropdownMenuItem>
      <DropdownMenuItem v-else @select="emit('action', 'ban')">
        <Lock />
        Sperren
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        @select="emit('action', 'remove')"
      >
        <Trash2 />
        Entfernen
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
