import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import NavUserIdentity from './NavUserIdentity.vue'

function identity(name: string, grayscale = false) {
  return mount(NavUserIdentity, {
    props: { user: { name, email: 'max@example.com', avatar: '' }, grayscale },
  })
}

test('shows name, e-mail and up to two initials', () => {
  const wrapper = identity('  max  von mustermann ')
  expect(wrapper.text()).toContain('max  von mustermann')
  expect(wrapper.text()).toContain('max@example.com')
  expect(wrapper.find('[data-slot="avatar-fallback"]').text()).toBe('MV')
})

test('renders no initials for an empty name', () => {
  expect(identity('').find('[data-slot="avatar-fallback"]').text()).toBe('')
})

test('greys out the avatar on request', () => {
  expect(identity('A', true).find('[data-slot="avatar"]').classes()).toContain(
    'grayscale',
  )
  expect(identity('A').find('[data-slot="avatar"]').classes()).not.toContain(
    'grayscale',
  )
})
