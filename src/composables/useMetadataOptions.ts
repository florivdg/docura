import { ref } from 'vue'
import { apiFetch } from '@/lib/api-fetch'

export interface FolderOption {
  id: string
  name: string
  parentId: string | null
}

export interface TagOption {
  id: string
  name: string
  color: string | null
}

export interface CorrespondentOption {
  id: string
  name: string
}

// Module-level state: all components on a page share one load of the options.
const folders = ref<FolderOption[]>([])
const tags = ref<TagOption[]>([])
const correspondents = ref<CorrespondentOption[]>([])
let loadPromise: Promise<void> | null = null

async function fetchOptions(): Promise<void> {
  const [foldersRes, tagsRes, correspondentsRes] = await Promise.all([
    apiFetch('/api/folders/all'),
    apiFetch('/api/tags'),
    apiFetch('/api/correspondents'),
  ])
  if (!foldersRes.ok || !tagsRes.ok || !correspondentsRes.ok) {
    throw new Error('Optionen konnten nicht geladen werden')
  }
  const foldersData = await foldersRes.json()
  const tagsData = await tagsRes.json()
  const correspondentsData = await correspondentsRes.json()
  folders.value = foldersData.folders ?? []
  tags.value = (tagsData.tags ?? []).map(
    (t: { id: string; name: string; color: string | null }) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    }),
  )
  correspondents.value = correspondentsData.correspondents ?? []
}

/** Gemeinsame Ordner-/Tag-/Korrespondenten-Optionen für Filter und Dialoge. */
export function useMetadataOptions() {
  function ensureLoaded(): Promise<void> {
    if (!loadPromise) {
      loadPromise = fetchOptions().catch((err) => {
        // Reset so the next caller retries the load
        loadPromise = null
        console.error('Filter-Daten laden fehlgeschlagen:', err)
      })
    }
    return loadPromise
  }

  return { folders, tags, correspondents, ensureLoaded }
}
