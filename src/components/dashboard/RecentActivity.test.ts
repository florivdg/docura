import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import RecentActivity from './RecentActivity.vue'
import { groupFixture as group } from '@/test/activity-fixture'

test('links existing documents and describes batches', () => {
  const wrapper = mount(RecentActivity, {
    props: {
      loading: false,
      entries: [
        group({ count: 12 }),
        group({
          batchId: 'b2',
          action: 'updated',
          changes: { name: { from: 'Scan.pdf', to: 'Rechnung.pdf' } },
        }),
      ],
    },
  })
  const text = wrapper.text()
  expect(text).toContain('Anna hat 12 Dokumente in den Papierkorb verschoben')
  expect(text).toContain('und 11 weitere')
  expect(text).toContain('Name: Scan.pdf → Rechnung.pdf')
  expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual([
    '/documents/doc',
    '/documents/doc',
  ])
})

test('shows deleted documents without a link', () => {
  const wrapper = mount(RecentActivity, {
    props: {
      loading: false,
      entries: [
        group({ action: 'deleted', document: { id: null, name: 'Alt.pdf' } }),
      ],
    },
  })
  expect(wrapper.text()).toContain('Alt.pdf (gelöscht)')
  expect(wrapper.find('a').exists()).toBe(false)
})

test('shows an empty state', () => {
  const wrapper = mount(RecentActivity, {
    props: { loading: false, entries: [] },
  })
  expect(wrapper.text()).toContain('Noch keine Aktivitäten')
})

test('marks system actions but not user actions', () => {
  const wrapper = mount(RecentActivity, {
    props: {
      loading: false,
      entries: [
        group({
          batchId: 'b2',
          action: 'uploaded',
          actorType: 'system',
          actorId: null,
          actorName: 'Watch-Ordner',
        }),
        group(),
      ],
    },
  })
  const [system, user] = wrapper.findAll('li')
  expect(system.text()).toContain('Automatisch')
  expect(system.find('[title="Automatische Aktion"]').exists()).toBe(true)
  expect(user.text()).not.toContain('Automatisch')
})
