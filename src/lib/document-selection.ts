type DocumentId = { id: string }
export function selectionState(
  documents: DocumentId[],
  ids: string[],
): boolean | 'indeterminate' {
  const selected = new Set(ids)
  if (documents.length && documents.every((doc) => selected.has(doc.id)))
    return true
  return documents.some((doc) => selected.has(doc.id)) ? 'indeterminate' : false
}
export function selectVisible(
  documents: DocumentId[],
  ids: string[],
  checked: boolean | 'indeterminate',
): string[] {
  const visible = new Set(documents.map((doc) => doc.id))
  const hidden = ids.filter((id) => !visible.has(id))
  return checked === true ? [...hidden, ...visible] : hidden
}
export function selectDocument(
  id: string,
  ids: string[],
  checked: boolean | 'indeterminate',
): string[] {
  if (checked !== true) return ids.filter((selected) => selected !== id)
  return ids.includes(id) ? ids : [...ids, id]
}
