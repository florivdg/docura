import { expect, test } from 'vitest'
import {
  coercedUserId,
  createUserPasswordError,
  ownRoleChangeError,
  roleChangeTarget,
} from './admin-guard'

const config = { minPasswordLength: 16, maxPasswordLength: 128 }

test('finds the target of role changes only', () => {
  expect(roleChangeTarget('/admin/set-role', { userId: 'u1' })).toBe('u1')
  expect(
    roleChangeTarget('/admin/update-user', {
      userId: 'u1',
      data: { role: 'user' },
    }),
  ).toBe('u1')
  expect(
    roleChangeTarget('/admin/update-user', {
      userId: 'u1',
      data: { name: 'Neu' },
    }),
  ).toBeNull()
  expect(roleChangeTarget('/admin/ban-user', { userId: 'u1' })).toBeNull()
  expect(roleChangeTarget('/admin/set-role', { role: 'user' })).toBeNull()
  expect(roleChangeTarget('/admin/set-role', null)).toBeNull()
})

test('coerces the target like the admin plugin does', () => {
  expect(
    roleChangeTarget('/admin/set-role', { userId: ['u1'], role: 'user' }),
  ).toBe('u1')
  expect(
    roleChangeTarget('/admin/update-user', {
      userId: ['u1'],
      data: { role: 'user' },
    }),
  ).toBe('u1')
  expect(roleChangeTarget('/admin/set-role', { userId: 1 })).toBe('1')
  expect(coercedUserId({ userId: 123 })).toBe('123')
  expect(coercedUserId({ userId: ['abc'] })).toBe('abc')
  expect(coercedUserId({ userId: null })).toBeNull()
  expect(coercedUserId({})).toBeNull()
  expect(coercedUserId('u1')).toBeNull()
})

test('rejects own role changes with a dedicated code', () => {
  expect(ownRoleChangeError().body).toMatchObject({
    code: 'YOU_CANNOT_CHANGE_YOUR_OWN_ROLE',
  })
})

test('applies the configured password limits to create-user', () => {
  const path = '/admin/create-user'
  expect(
    createUserPasswordError(path, { password: 'kurz' }, config)?.body,
  ).toMatchObject({ code: 'PASSWORD_TOO_SHORT' })
  expect(
    createUserPasswordError(path, { password: 'x'.repeat(129) }, config)?.body,
  ).toMatchObject({ code: 'PASSWORD_TOO_LONG' })
  expect(
    createUserPasswordError(path, { password: 'x'.repeat(16) }, config),
  ).toBeNull()
  expect(createUserPasswordError(path, {}, config)).toBeNull()
  expect(
    createUserPasswordError('/admin/set-role', { password: 'kurz' }, config),
  ).toBeNull()
})
