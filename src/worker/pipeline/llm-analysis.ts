import { and, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { document } from '@/db/schema/documents'
import { WORKER_CONFIG } from '@/worker/config'
import { chatWithOllama } from '@/worker/clients/ollama'
import { updateStep } from '@/worker/pipeline/job-lifecycle'
import { applyCorrespondent } from '@/worker/services/correspondent-service'
import { applyFolderSuggestion } from '@/worker/services/folder-service'
import { loadExistingMetadata } from '@/worker/services/metadata-service'
import { applyTags } from '@/worker/services/tag-service'
import type { LlmAnalysisResult } from '@/worker/types'
import {
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
    const responseText = await chatWithOllama(systemPrompt, truncatedText)

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(responseText)
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

export async function runLlmAnalysis(
  doc: { id: string; folderId: string | null; correspondentId: string | null },
  textContent: string,
  jobId: string,
) {
  await updateStep(jobId, doc.id, 'llm_analysis')

  const { existingTags, existingFolders, existingCorrespondents } =
    await loadExistingMetadata()
  const analysis = await analyzeLlm(
    textContent,
    existingTags,
    existingFolders,
    existingCorrespondents,
  )

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
    // Only fill an empty Belegdatum — never overwrite a manually entered date
    const updated = await db
      .update(document)
      .set({ documentDate: analysis.documentDate })
      .where(and(eq(document.id, doc.id), isNull(document.documentDate)))
      .returning({ id: document.id })

    if (updated.length > 0) {
      console.log(
        `Belegdatum erkannt für Dokument ${doc.id}: ${analysis.documentDate}`,
      )
    } else {
      console.log(
        `Belegdatum für Dokument ${doc.id} bereits gesetzt — Vorschlag "${analysis.documentDate}" verworfen`,
      )
    }
  }

  if (analysis.correspondent) {
    await applyCorrespondent(doc, analysis.correspondent)
  }
}
