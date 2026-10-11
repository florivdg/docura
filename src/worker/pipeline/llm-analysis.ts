import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import {
  loadActivitySnapshots,
  recordActivities,
  SYSTEM_ACTORS,
} from '@/db/activity'
import { document } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'
import { chatWithOllama } from '@/worker/clients/ollama'
import {
  assertLease,
  type JobLease,
  updateStep,
} from '@/worker/pipeline/job-lifecycle'
import { applyCorrespondent } from '@/worker/services/correspondent-service'
import { applyFolderSuggestion } from '@/worker/services/folder-service'
import { loadExistingMetadata } from '@/worker/services/metadata-service'
import { applyTags } from '@/worker/services/tag-service'
import type { LlmAnalysisResult } from '@/worker/types'
import {
  type ActivityChanges,
  type ActivityField,
  diffSnapshots,
  type DocumentSnapshot,
} from '@/lib/activity'
import {
  parseLlmJson,
  sanitizeCorrespondent,
  sanitizeDocumentDate,
  sanitizeFolderSuggestion,
  sanitizeTags,
  sanitizeTitle,
} from '@/worker/utils/text'

async function analyzeLlm(
  textContent: string,
  existingTags: { id: string; name: string }[],
  existingFolders: { id: string; name: string }[],
  existingCorrespondents: { id: string; name: string }[],
  signal: AbortSignal,
): Promise<LlmAnalysisResult> {
  const empty: LlmAnalysisResult = {
    title: null,
    tags: [],
    folderSuggestion: null,
    documentDate: null,
    correspondent: null,
  }
  const truncatedText = textContent.substring(0, WORKER_CONFIG.llmTextLimit)

  const tagList =
    existingTags.length > 0
      ? existingTags.map((t) => t.name).join(', ')
      : '(keine vorhanden)'
  const folderList =
    existingFolders.length > 0
      ? existingFolders.map((f) => f.name).join(', ')
      : '(keine vorhanden)'
  const correspondentList =
    existingCorrespondents.length > 0
      ? existingCorrespondents.map((c) => c.name).join(', ')
      : '(keine vorhanden)'

  const systemPrompt = `Du bist ein Dokumentenmanagement-Assistent. Analysiere den vom Benutzer bereitgestellten Dokumententext und extrahiere strukturierte Metadaten.

Aufgaben:
1. Erstelle einen kurzen, prägnanten deutschen Titel (maximal 10 Wörter), der den Inhalt treffend beschreibt. Verwende ausschließlich Plaintext — kein Markdown, keine Sonderformatierung.
2. Wähle bis zu 5 passende Tags aus der folgenden Liste. Verwende ausschließlich vorhandene Tags, es sei denn, keiner passt — nur dann darfst du einen neuen Tag-Namen vorschlagen.
3. Schlage einen passenden vorhandenen Ordner vor, in den das Dokument einsortiert werden könnte. Falls kein Ordner passt, setze null.
4. Ermittle das Belegdatum — das auf dem Dokument gedruckte Datum (z. B. Rechnungs-, Schreiben- oder Ausstellungsdatum), NICHT das Scan- oder Upload-Datum. Gib es im ISO-Format JJJJ-MM-TT an. Falls kein Belegdatum erkennbar ist, setze null.
5. Ermittle den Korrespondenten — den Absender des Dokuments (Firma, Organisation oder Person). Bevorzuge eine exakte oder sehr ähnliche Übereinstimmung aus der Liste der vorhandenen Korrespondenten und verwende dann exakt diese Schreibweise. Nur wenn kein vorhandener Korrespondent passt, schlage einen neuen Namen vor. Falls kein Absender erkennbar ist, setze null.

Vorhandene Tags: ${tagList}
Vorhandene Ordner: ${folderList}
Vorhandene Korrespondenten: ${correspondentList}

Antworte ausschließlich mit validem JSON in diesem Format:
{"title": "Der generierte Titel", "tags": ["Tag1", "Tag2"], "folderSuggestion": "Ordnername" oder null, "documentDate": "JJJJ-MM-TT" oder null, "correspondent": "Name" oder null}`

  try {
    const responseText = await chatWithOllama(
      systemPrompt,
      truncatedText,
      signal,
    )

    let parsed: Record<string, unknown>
    try {
      parsed = parseLlmJson(responseText) as Record<string, unknown>
    } catch {
      console.warn('LLM-Analyse: Antwort ist kein valides JSON')
      return empty
    }

    return {
      title: sanitizeTitle(parsed.title),
      tags: sanitizeTags(parsed.tags),
      folderSuggestion: sanitizeFolderSuggestion(parsed.folderSuggestion),
      documentDate: sanitizeDocumentDate(parsed.documentDate),
      correspondent: sanitizeCorrespondent(parsed.correspondent),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`LLM-Analyse fehlgeschlagen: ${message}`)
    return empty
  }
}

type AnalyzedDocument = {
  id: string
  folderId: string | null
  correspondentId: string | null
}

async function applyDocumentDate(id: string, documentDate: string) {
  // Only fill an empty Belegdatum — never overwrite a manually entered date
  const updated = await db
    .update(document)
    .set({ documentDate })
    .where(and(eq(document.id, id), isNull(document.documentDate)))
    .returning({ id: document.id })

  if (updated.length > 0) {
    console.log(`Belegdatum erkannt für Dokument ${id}: ${documentDate}`)
  } else {
    console.log(
      `Belegdatum für Dokument ${id} bereits gesetzt — Vorschlag "${documentDate}" verworfen`,
    )
  }
}

async function applyAnalysis(
  doc: AnalyzedDocument,
  analysis: LlmAnalysisResult,
) {
  if (analysis.title) {
    await db
      .update(document)
      .set({ name: analysis.title })
      .where(eq(document.id, doc.id))
    console.log(`Titel generiert für Dokument ${doc.id}: "${analysis.title}"`)
  }

  if (analysis.tags.length > 0) {
    await applyTags(doc.id, analysis.tags, true)
  }

  if (analysis.folderSuggestion) {
    await applyFolderSuggestion(doc, analysis.folderSuggestion)
  }

  if (analysis.documentDate) {
    await applyDocumentDate(doc.id, analysis.documentDate)
  }

  if (analysis.correspondent) {
    await applyCorrespondent(doc, analysis.correspondent)
  }
}

function warnActivity(id: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  console.warn(
    `KI-Analyse: Verlauf für Dokument ${id} nicht gespeichert: ${message}`,
  )
}

/**
 * The audited state, unlocked: the services write outside a shared
 * transaction, so a lock would only last for this statement.
 */
async function loadSnapshot(id: string) {
  const [snapshot] = await loadActivitySnapshots(db, [id], { lock: false })
  return snapshot
}

/** The state before the analysis is applied; null if it cannot be read. */
async function snapshotBefore(id: string): Promise<DocumentSnapshot | null> {
  try {
    const snapshot = await loadSnapshot(id)
    return snapshot ?? null
  } catch (error) {
    warnActivity(id, error)
    return null
  }
}

/** The audited fields the analysis tries to set; only these are recorded. */
function suggestedFields(analysis: LlmAnalysisResult): Set<ActivityField> {
  const fields = new Set<ActivityField>()
  if (analysis.title) fields.add('name')
  if (analysis.tags.length > 0) fields.add('tags')
  if (analysis.folderSuggestion) fields.add('folder')
  if (analysis.documentDate) fields.add('documentDate')
  if (analysis.correspondent) fields.add('correspondent')
  return fields
}

/** The changes restricted to `fields`; concurrent edits of others are not the analysis'. */
function pickChanges(
  changes: ActivityChanges,
  fields: Set<ActivityField>,
): ActivityChanges {
  return Object.fromEntries(
    Object.entries(changes).filter(([field]) =>
      fields.has(field as ActivityField),
    ),
  ) as ActivityChanges
}

/**
 * Records the applied fields as one `updated` entry. The services write
 * outside a shared transaction and the analysis is non-fatal, so a failure
 * here only logs. Known limit: a manual edit of a suggested field during the
 * analysis is attributed to KI-Analyse.
 */
async function recordAnalysis(
  id: string,
  before: DocumentSnapshot | null,
  fields: Set<ActivityField>,
) {
  if (!before) return
  try {
    const after = await loadSnapshot(id)
    if (!after) return
    const changes = pickChanges(diffSnapshots(before, after), fields)
    if (Object.keys(changes).length === 0) return
    await recordActivities(db, [
      {
        documentId: id,
        documentName: after.name,
        actor: SYSTEM_ACTORS.llm,
        action: 'updated',
        changes,
        batchId: randomUUID(),
      },
    ])
  } catch (error) {
    warnActivity(id, error)
  }
}

export async function runLlmAnalysis(
  doc: AnalyzedDocument,
  textContent: string,
  lease: JobLease,
) {
  await updateStep(lease, 'llm_analysis')

  const { existingTags, existingFolders, existingCorrespondents } =
    await loadExistingMetadata()
  const analysis = await analyzeLlm(
    textContent,
    existingTags,
    existingFolders,
    existingCorrespondents,
    lease.signal,
  )
  // A run that lost its job must not overwrite metadata. A lost lease that
  // aborted the LLM request above is logged as failed analysis and lands here.
  await assertLease(lease)

  // Nothing to apply means nothing to record: skip both snapshots.
  const fields = suggestedFields(analysis)
  if (fields.size === 0) return
  const before = await snapshotBefore(doc.id)
  try {
    await applyAnalysis(doc, analysis)
  } finally {
    // Also after a failed step: the retry's snapshot would already contain
    // the fields written so far. recordAnalysis never throws, so the original
    // error still fails the job.
    await recordAnalysis(doc.id, before, fields)
  }
}
