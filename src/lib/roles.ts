export const USER_ROLES = ['user', 'admin'] as const
export type UserRole = (typeof USER_ROLES)[number]

export function isUserRole(value: unknown): value is UserRole {
  return USER_ROLES.includes(value as UserRole)
}

/** Better Auth stores roles as a comma-separated string. */
// Assumes the admin plugin's default `adminRoles: ['admin']`.
export function isAdmin(user: { role?: string | null } | null | undefined) {
  return (user?.role ?? '').split(',').includes('admin')
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Benutzer',
  admin: 'Administrator',
}
