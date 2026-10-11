import { expect, test, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CorrespondentDialog from './CorrespondentDialog.vue'
import MergeCorrespondentsDialog from './MergeCorrespondentsDialog.vue'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-fetch', () => ({ apiFetch }))

const telekom = { id: 'c1', name: 'Telekom' }

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

async function typeName(value: string) {
  const input = document.getElementById(
    'correspondent-name',
  ) as HTMLInputElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function submit() {
  document.querySelector('form')!.dispatchEvent(new Event('submit'))
  await flushPromises()
}

test('creates a correspondent with a trimmed name', async () => {
  apiFetch.mockResolvedValueOnce(
    reply({ correspondent: telekom, created: true }, 201),
  )
  const wrapper = mount(CorrespondentDialog, {
    props: { open: true },
    attachTo: document.body,
  })
  await flushPromises()
  await submit()
  expect(document.body.textContent).toContain('Name darf nicht leer sein')
  expect(apiFetch).not.toHaveBeenCalled()
  await typeName('  Telekom ')
  await submit()
  expect(apiFetch).toHaveBeenCalledWith('/api/correspondents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Telekom' }),
  })
  expect(wrapper.emitted('saved')).toEqual([[telekom, 'created']])
  apiFetch.mockResolvedValueOnce(
    reply({ correspondent: telekom, created: false }),
  )
  await submit()
  expect(wrapper.emitted('saved')?.[1]).toEqual([telekom, 'existing'])
})

test('renames and shows the conflict message of the server', async () => {
  apiFetch.mockResolvedValueOnce(
    reply(
      { error: 'Ein Korrespondent mit diesem Namen existiert bereits.' },
      409,
    ),
  )
  const wrapper = mount(CorrespondentDialog, {
    props: { open: true, correspondent: telekom },
    attachTo: document.body,
  })
  await flushPromises()
  const input = document.getElementById(
    'correspondent-name',
  ) as HTMLInputElement
  expect(input.value).toBe('Telekom')
  await typeName('Deutsche Telekom AG')
  await submit()
  expect(apiFetch.mock.calls[0][0]).toBe('/api/correspondents/c1')
  expect(apiFetch.mock.calls[0][1].method).toBe('PATCH')
  expect(document.body.textContent).toContain('existiert bereits')
  expect(wrapper.emitted('saved')).toBeUndefined()
  apiFetch.mockResolvedValueOnce(new Response('kaputt', { status: 502 }))
  await submit()
  expect(document.body.textContent).toContain('Ein Fehler ist aufgetreten')
  apiFetch.mockResolvedValueOnce(
    reply({ correspondent: { ...telekom, name: 'Deutsche Telekom AG' } }),
  )
  await submit()
  expect(wrapper.emitted('saved')).toEqual([
    [{ ...telekom, name: 'Deutsche Telekom AG' }, 'renamed'],
  ])
})

test('suggests the correspondent with the most documents as merge target', async () => {
  const wrapper = mount(MergeCorrespondentsDialog, {
    props: {
      open: true,
      correspondents: [
        { ...telekom, createdAt: '', documentCount: 1 },
        {
          id: 'c2',
          name: 'Deutsche Telekom AG',
          createdAt: '',
          documentCount: 5,
        },
      ],
    },
    attachTo: document.body,
  })
  await flushPromises()
  const checked = document.querySelector('[role="radio"][data-state="checked"]')
  expect(checked?.id).toBe('merge-target-c2')
  ;(document.getElementById('merge-target-c1') as HTMLElement).click()
  await flushPromises()
  const confirm = [...document.body.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Zusammenführen',
  )
  confirm?.click()
  await flushPromises()
  expect(wrapper.emitted('confirm')).toEqual([['c1']])
  expect(wrapper.emitted('update:open')).toEqual([[false]])
})
