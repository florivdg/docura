import { expect, test } from 'vitest'
import { passwordValidationError } from './password-policy'
import { isAdmin, isUserRole } from './roles'

test('validates length and confirmation', () => {
  expect(passwordValidationError('kurz')).toContain('mindestens 16')
  expect(passwordValidationError('x'.repeat(129))).toContain('höchstens 128')
  expect(passwordValidationError('x'.repeat(16), 'y'.repeat(16))).toContain(
    'stimmen nicht überein',
  )
  expect(passwordValidationError('x'.repeat(16))).toBe('')
})

test('detects admin roles and valid role names', () => {
  expect(isAdmin({ role: 'admin' })).toBe(true)
  expect(isAdmin({ role: 'user,admin' })).toBe(true)
  expect(isAdmin({ role: 'user' })).toBe(false)
  expect(isAdmin({ role: null })).toBe(false)
  expect(isAdmin(undefined)).toBe(false)
  expect(isUserRole('admin')).toBe(true)
  expect(isUserRole('root')).toBe(false)
})
