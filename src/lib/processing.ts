/** 'full' runs the whole pipeline, 'embedding' only recomputes the vector. */
export type JobKind = 'full' | 'embedding'

/** Badge colours for a healthy/completed state. */
export const SUCCESS_BADGE_CLASS =
  'border-green-500/30 bg-green-500/10 text-green-400'

export const statusConfig: Record<
  string,
  {
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
    label: string
    class?: string
  }
> = {
  pending: { variant: 'secondary', label: 'Ausstehend' },
  processing: { variant: 'default', label: 'Verarbeitung' },
  completed: {
    variant: 'outline',
    label: 'Abgeschlossen',
    class: SUCCESS_BADGE_CLASS,
  },
  failed: { variant: 'destructive', label: 'Fehlgeschlagen' },
}

export const stepLabels: Record<string, string> = {
  text_extraction: 'Textextraktion',
  ocr: 'Texterkennung',
  llm_analysis: 'KI-Analyse',
  embedding: 'Einbettung',
}
