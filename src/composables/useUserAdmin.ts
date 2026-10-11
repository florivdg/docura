import { ref } from 'vue'
import type { UserWithRole } from 'better-auth/plugins'
import { useAuthRequest } from '@/composables/useAuthRequest'
import { authClient } from '@/lib/auth-client'
import { isAdmin, ROLE_LABELS } from '@/lib/roles'

export type AdminUserRow = Pick<
  UserWithRole,
  'id' | 'name' | 'email' | 'role' | 'banned' | 'createdAt'
>

interface UserBadge {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
}

/** Role and status badges shown in a user's table row. */
export function userBadges(
  user: AdminUserRow,
): [role: UserBadge, status: UserBadge] {
  return [
    isAdmin(user)
      ? { label: ROLE_LABELS.admin, variant: 'default' }
      : { label: ROLE_LABELS.user, variant: 'secondary' },
    user.banned
      ? { label: 'Gesperrt', variant: 'destructive' }
      : { label: 'Aktiv', variant: 'outline' },
  ]
}

export type UserActionKind = 'promote' | 'demote' | 'ban' | 'unban' | 'remove'

interface UserActionCopy {
  title: string
  description: (name: string) => string
  confirmLabel: string
  destructive: boolean
  success: (name: string) => string
  failure: string
}

/** Texts of the confirmation dialog for every row action. */
export const USER_ACTIONS: Record<UserActionKind, UserActionCopy> = {
  promote: {
    title: 'Zum Administrator ernennen',
    description: (name) =>
      `${name} kann danach Benutzer anlegen, sperren und entfernen.`,
    confirmLabel: 'Ernennen',
    destructive: false,
    success: (name) => `${name} ist jetzt Administrator.`,
    failure: 'Rolle konnte nicht geändert werden.',
  },
  demote: {
    title: 'Administratorrechte entziehen',
    description: (name) =>
      `${name} verliert den Zugriff auf die Benutzerverwaltung.`,
    confirmLabel: 'Rechte entziehen',
    destructive: true,
    success: (name) => `${name} ist jetzt Benutzer.`,
    failure: 'Rolle konnte nicht geändert werden.',
  },
  ban: {
    title: 'Benutzer sperren',
    description: (name) =>
      `${name} wird sofort abgemeldet und kann sich nicht mehr anmelden.`,
    confirmLabel: 'Sperren',
    destructive: true,
    success: (name) => `${name} wurde gesperrt.`,
    failure: 'Benutzer konnte nicht gesperrt werden.',
  },
  unban: {
    title: 'Sperre aufheben',
    description: (name) => `${name} kann sich danach wieder anmelden.`,
    confirmLabel: 'Entsperren',
    destructive: false,
    success: (name) => `Die Sperre von ${name} wurde aufgehoben.`,
    failure: 'Sperre konnte nicht aufgehoben werden.',
  },
  remove: {
    title: 'Benutzer entfernen',
    description: (name) =>
      `${name} wird dauerhaft gelöscht. Dokumente in der gemeinsamen Bibliothek bleiben erhalten.`,
    confirmLabel: 'Entfernen',
    destructive: true,
    success: (name) => `${name} wurde entfernt.`,
    failure: 'Benutzer konnte nicht entfernt werden.',
  },
}

const LOAD_FAILED = 'Benutzer konnten nicht geladen werden.'

/** Row actions answer with the updated user, removal only with `success`. */
interface ActionResult {
  data: { user?: AdminUserRow; success?: boolean } | null
  error: { code?: string; message?: string } | null
}

function requestFor(
  kind: UserActionKind,
  userId: string,
): Promise<ActionResult> {
  const admin = authClient.admin
  switch (kind) {
    case 'promote':
      return admin.setRole({ userId, role: 'admin' })
    case 'demote':
      return admin.setRole({ userId, role: 'user' })
    case 'ban':
      return admin.banUser({ userId })
    case 'unban':
      return admin.unbanUser({ userId })
    case 'remove':
      return admin.removeUser({ userId })
  }
}

export function useUserAdmin() {
  const users = ref<AdminUserRow[]>([])
  const loading = ref(true)
  const { error, run } = useAuthRequest()

  async function fetchUsers() {
    loading.value = true
    const result = await run(
      () =>
        authClient.admin.listUsers({
          query: { limit: 1000, sortBy: 'createdAt', sortDirection: 'asc' },
        }),
      LOAD_FAILED,
    )
    if (result?.data) users.value = result.data.users
    loading.value = false
  }

  /** Runs a row action and applies its result to the list without refetching. */
  async function runAction(kind: UserActionKind, user: AdminUserRow) {
    const result = await run(
      () => requestFor(kind, user.id),
      USER_ACTIONS[kind].failure,
    )
    if (!result) return false
    const updated = result.data?.user
    users.value =
      kind === 'remove'
        ? users.value.filter((row) => row.id !== user.id)
        : users.value.map((row) =>
            row.id === user.id ? (updated ?? row) : row,
          )
    return true
  }

  return { users, loading, error, fetchUsers, runAction }
}
