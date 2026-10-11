import { expect, test, vi } from 'vitest'
import { ref } from 'vue'
import { shallowMount } from '@vue/test-utils'
import AppSidebar from './AppSidebar.vue'

const session = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => session.value },
}))
vi.mock('@/composables/useSearchCommand', () => ({
  useSearchCommand: () => ({ openSearch: vi.fn() }),
}))

function sidebar(user: Record<string, unknown> | null) {
  session.value = ref({ data: user ? { user } : null })
  return shallowMount(AppSidebar, {
    global: { renderStubDefaultSlot: true },
  })
}

function secondaryTitles(wrapper: ReturnType<typeof shallowMount>) {
  return wrapper
    .getComponent({ name: 'NavSecondary' })
    .props('items')
    .map((item: { title: string }) => item.title)
}

test('shows the user management entry to admins only', () => {
  expect(secondaryTitles(sidebar({ name: 'A', role: 'admin' }))).toContain(
    'Benutzer',
  )
  expect(secondaryTitles(sidebar({ name: 'B', role: 'user' }))).not.toContain(
    'Benutzer',
  )
})

test('passes the signed-in user to the footer', () => {
  expect(
    sidebar({ name: 'Max', email: 'max@example.com', image: null })
      .getComponent({ name: 'NavUser' })
      .props('user'),
  ).toEqual({ name: 'Max', email: 'max@example.com', avatar: '' })
  expect(sidebar(null).getComponent({ name: 'NavUser' }).props('user')).toEqual(
    {
      name: '',
      email: '',
      avatar: '',
    },
  )
})

test('shows the system status entry to every user', () => {
  expect(secondaryTitles(sidebar({ name: 'B', role: 'user' }))).toContain(
    'System',
  )
})

test('links every secondary entry to a real page', () => {
  const items = sidebar({ name: 'A', role: 'admin' })
    .getComponent({ name: 'NavSecondary' })
    .props('items') as { title: string; url: string }[]
  expect(items.map((item) => item.title)).not.toContain('Hilfe')
  for (const item of items) expect(item.url).toMatch(/^\/\w/)
})
