<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Plus, Users } from 'lucide-vue-next'
import {
  USER_ACTIONS,
  userBadges,
  useUserAdmin,
  type AdminUserRow,
  type UserActionKind,
} from '@/composables/useUserAdmin'
import { formatDate } from '@/lib/format'
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import StatusMessage from '@/components/StatusMessage.vue'
import CreateUserDialog from '@/components/users/CreateUserDialog.vue'
import SetPasswordDialog from '@/components/users/SetPasswordDialog.vue'
import UserActionDialog from '@/components/users/UserActionDialog.vue'
import UserActionsMenu from '@/components/users/UserActionsMenu.vue'

const props = defineProps<{ currentUserId: string }>()

const { users, loading, error, fetchUsers, runAction } = useUserAdmin()
const notice = ref('')
const createOpen = ref(false)
const passwordOpen = ref(false)
const passwordUser = ref<AdminUserRow | null>(null)
const confirmOpen = ref(false)
const pending = ref<{ kind: UserActionKind; user: AdminUserRow } | null>(null)

function ask(kind: UserActionKind, user: AdminUserRow) {
  notice.value = ''
  pending.value = { kind, user }
  confirmOpen.value = true
}

async function confirmPending() {
  if (!pending.value) return
  const { kind, user } = pending.value
  confirmOpen.value = false
  if (await runAction(kind, user)) {
    notice.value = USER_ACTIONS[kind].success(user.name)
  }
}

function openPassword(user: AdminUserRow) {
  notice.value = ''
  passwordUser.value = user
  passwordOpen.value = true
}

function onPasswordSaved() {
  passwordOpen.value = false
  notice.value = `Das Passwort von ${passwordUser.value?.name} wurde gesetzt.`
}

function onCreated(user: AdminUserRow) {
  createOpen.value = false
  users.value = [...users.value, user]
  notice.value = `Benutzer ${user.email} wurde angelegt.`
}

onMounted(fetchUsers)
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <StatusMessage :error="error" :notice="notice" />
    <Button size="sm" @click="createOpen = true">
      <Plus class="size-4" />
      Neuer Benutzer
    </Button>
  </div>

  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>E-Mail</TableHead>
        <TableHead>Rolle</TableHead>
        <TableHead>Status</TableHead>
        <TableHead>Erstellt</TableHead>
        <TableHead class="w-12" />
      </TableRow>
    </TableHeader>
    <TableBody>
      <template v-if="loading && users.length === 0">
        <TableRow v-for="i in 3" :key="i">
          <TableCell :colspan="6"><Skeleton class="h-4 w-full" /></TableCell>
        </TableRow>
      </template>
      <TableEmpty v-else-if="users.length === 0" :colspan="6">
        <div class="flex flex-col items-center gap-2">
          <Users class="text-muted-foreground size-8" />
          <p class="text-muted-foreground text-sm">Keine Benutzer vorhanden</p>
        </div>
      </TableEmpty>
      <TableRow v-for="u in users" v-else :key="u.id" :data-user-id="u.id">
        <TableCell class="font-medium">
          {{ u.name }}
          <Badge
            v-if="u.id === props.currentUserId"
            variant="outline"
            class="ml-2"
          >
            Sie
          </Badge>
        </TableCell>
        <TableCell>{{ u.email }}</TableCell>
        <TableCell v-for="badge in userBadges(u)" :key="badge.label">
          <Badge :variant="badge.variant">{{ badge.label }}</Badge>
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDate(u.createdAt) }}
        </TableCell>
        <TableCell>
          <UserActionsMenu
            :user="u"
            :self="u.id === props.currentUserId"
            @action="(kind) => ask(kind, u)"
            @password="openPassword(u)"
          />
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>

  <CreateUserDialog v-model:open="createOpen" @saved="onCreated" />
  <SetPasswordDialog
    v-if="passwordUser"
    v-model:open="passwordOpen"
    :user="passwordUser"
    @saved="onPasswordSaved"
  />
  <UserActionDialog
    v-model:open="confirmOpen"
    :pending="pending"
    @confirm="confirmPending"
  />
</template>
